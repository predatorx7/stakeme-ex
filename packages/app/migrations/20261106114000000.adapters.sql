-- Planned by `npm run migrate:plan`, then edited by hand: the two SET lines
-- (unqualified types need smx on the path) and a column rename in place of
-- the planner's drop + add, which would lose the stored terms refs.
SET search_path TO smx, public;
SET check_function_bodies = off;

DROP FUNCTION smx.complete_chain_job(p_job uuid, p_status chain_job_status, p_tx_hash tx_hash, p_error text, p_isa evm_address, p_token evm_address);
DROP FUNCTION smx.launch_ipo(p_owner uuid, p_wallet evm_address, p_ticker text, p_display_name text, p_headline text, p_share_bps integer, p_term_months integer, p_target_raise money_amount, p_stake_amount money_amount, p_nullifier text, p_arkiv_entity_key text, p_terms_hash text, p_chain_id integer, p_tranche_bps integer[]);
DROP FUNCTION smx.submit_income_proof(p_creator uuid, p_provider text, p_reclaim_proof_id text, p_amount money_amount, p_raw jsonb, p_period integer);
ALTER TABLE smx.chain_jobs DROP CONSTRAINT chain_jobs_fn_check;
ALTER TABLE smx.creators RENAME COLUMN arkiv_entity_key TO terms_ref;
ALTER TABLE smx.creators RENAME CONSTRAINT creators_arkiv_entity_key_check TO creators_terms_ref_check;
ALTER TYPE smx.oracle_event_kind ADD VALUE 'ESCROW_FROZEN' AFTER 'TRADE';
ALTER TYPE smx.oracle_event_kind ADD VALUE 'ESCROW_UNFROZEN' AFTER 'ESCROW_FROZEN';
CREATE TYPE smx.reclaim_session_status AS ENUM ('PENDING', 'SUCCESS', 'REJECTED', 'ERROR', 'CANCELLED', 'EXPIRED');
CREATE OR REPLACE FUNCTION smx.audit_income_proof(p_proof uuid, p_verified_amount money_amount, p_audit jsonb DEFAULT '{}'::jsonb)
 RETURNS income_proofs
 LANGUAGE plpgsql
 SET search_path TO 'smx', 'public'
AS $function$
DECLARE
	v_proof income_proofs;
	v_creator creators;
	v_reason TEXT;
	v_dividend dividends;
	v_tranche tranches;
BEGIN
	SELECT * INTO v_proof FROM income_proofs ip WHERE ip.id = p_proof FOR UPDATE;
	PERFORM assert_that(FOUND, 404, 'Proof not found');
	PERFORM assert_that(v_proof.status = 'PENDING', 409, 'Proof was already audited');
	SELECT * INTO v_creator FROM creators c
	WHERE c.id = v_proof.creator_id FOR UPDATE;
	PERFORM assert_that(
		v_creator.status IN ('LIVE', 'GRACE'), 409,
		'This creator is not accepting proofs'
	);

	v_reason := CASE
		WHEN p_verified_amount < v_creator.min_income
			THEN 'Income is below the ' || v_creator.min_income::TEXT || ' USDC minimum'
		WHEN EXISTS (
			SELECT 1 FROM income_proofs ip
			WHERE ip.creator_id = v_proof.creator_id
				AND ip.period = v_proof.period AND ip.status = 'APPROVED'
		) THEN 'Period ' || v_proof.period || ' is already approved'
		WHEN coalesce((p_audit ->> 'approved')::BOOLEAN, TRUE) IS FALSE
			THEN 'Auditor rejected the proof'
	END;

	IF v_reason IS NOT NULL THEN
		UPDATE income_proofs SET
			status = 'REJECTED',
			verified_amount = p_verified_amount,
			audit = coalesce(p_audit, '{}') || jsonb_build_object('reason', v_reason),
			audit_log_ref = p_audit ->> 'logRef'
		WHERE id = p_proof
		RETURNING * INTO v_proof;
		PERFORM emit_oracle_event(v_creator.id, 'PROOF_REJECTED', jsonb_build_object(
			'proofId', p_proof, 'period', v_proof.period, 'reason', v_reason,
			'amount', p_verified_amount::TEXT
		));
		RETURN v_proof;
	END IF;

	UPDATE income_proofs SET
		status = 'APPROVED',
		verified_amount = p_verified_amount,
		audit = p_audit,
		audit_log_ref = p_audit ->> 'logRef'
	WHERE id = p_proof
	RETURNING * INTO v_proof;

	INSERT INTO dividends(creator_id, proof_id, amount_due)
	VALUES (
		v_creator.id, p_proof,
		round(p_verified_amount * v_creator.share_bps / 10000, 6)
	)
	RETURNING * INTO v_dividend;

	-- Release the earliest locked tranche, if any remain.
	UPDATE tranches SET status = 'RELEASED', released_at = now()
	WHERE id = (
		SELECT t.id FROM tranches t
		WHERE t.creator_id = v_creator.id AND t.status = 'LOCKED'
		ORDER BY t.idx LIMIT 1 FOR UPDATE
	)
	RETURNING * INTO v_tranche;

	-- A late proof inside the grace period lifts the escrow freeze.
	IF v_creator.status = 'GRACE' THEN
		PERFORM emit_oracle_event(v_creator.id, 'ESCROW_UNFROZEN', jsonb_build_object(
			'proofId', p_proof, 'period', v_proof.period
		));
		PERFORM enqueue_chain_job(v_creator.id, 'unfreezeEscrow', '{}');
	END IF;

	-- From the later of the old deadline and now, so a late proof doesn't
	-- leave the creator immediately overdue again.
	UPDATE creators SET
		next_proof_due_at = greatest(next_proof_due_at, now()) + interval '30 days',
		grace_until = NULL,
		status = 'LIVE'
	WHERE id = v_creator.id;

	PERFORM emit_oracle_event(v_creator.id, 'PROOF_VERIFIED', jsonb_build_object(
		'proofId', p_proof,
		'period', v_proof.period,
		'amount', p_verified_amount::TEXT,
		'dividendId', v_dividend.id,
		'dividendDue', v_dividend.amount_due::TEXT,
		'model', p_audit ->> 'model',
		'reasoning', p_audit ->> 'reasoning'
	));

	IF v_tranche.id IS NOT NULL THEN
		PERFORM emit_oracle_event(v_creator.id, 'TRANCHE_RELEASED', jsonb_build_object(
			'idx', v_tranche.idx, 'amount', v_tranche.amount::TEXT
		));
		PERFORM enqueue_chain_job(v_creator.id, 'unlockNextTranche', jsonb_build_object(
			'idx', v_tranche.idx, 'amount', v_tranche.amount::TEXT
		));
	END IF;

	RETURN v_proof;
END;
$function$;
CREATE FUNCTION smx.complete_chain_job(p_job uuid, p_status chain_job_status, p_tx_hash tx_hash DEFAULT NULL::text, p_error text DEFAULT NULL::text, p_isa evm_address DEFAULT NULL::citext, p_token evm_address DEFAULT NULL::citext, p_ats_token evm_address DEFAULT NULL::citext)
 RETURNS chain_jobs
 LANGUAGE plpgsql
 SET search_path TO 'smx', 'public'
AS $function$
DECLARE
	v_job chain_jobs;
BEGIN
	UPDATE chain_jobs SET status = p_status, tx_hash = p_tx_hash, error = p_error
	WHERE id = p_job AND status IN ('QUEUED', 'SENT')
	RETURNING * INTO v_job;
	PERFORM assert_that(FOUND, 409, 'Chain job already settled or missing');

	IF p_status IN ('CONFIRMED', 'SIMULATED') THEN
		IF v_job.fn = 'createISA' AND p_isa IS NOT NULL THEN
			UPDATE creators SET
				contract_address = p_isa, token_address = p_token,
				ats_token_address = p_ats_token
			WHERE id = v_job.creator_id;
		ELSIF v_job.fn = 'unlockNextTranche' THEN
			UPDATE tranches SET tx_hash = p_tx_hash
			WHERE creator_id = v_job.creator_id
				AND idx = (v_job.args ->> 'idx')::INTEGER;
		ELSIF v_job.fn = 'distributeDividend' THEN
			UPDATE dividends SET paid_tx_hash = p_tx_hash
			WHERE id = (v_job.args ->> 'dividendId')::UUID;
		ELSIF v_job.fn = 'invest' THEN
			UPDATE investments SET tx_hash = p_tx_hash
			WHERE id = (v_job.args ->> 'investmentId')::UUID;
		END IF;
	END IF;

	RETURN v_job;
END;
$function$;
CREATE OR REPLACE FUNCTION smx.creator_json(c creators)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'smx', 'public'
AS $function$
	SELECT creator_summary_json(c) || jsonb_strip_nulls(jsonb_build_object(
		'ownerWallet', c.owner_wallet::TEXT,
		'termMonths', c.term_months,
		'stakeAmount', c.stake_amount::TEXT,
		'minIncome', c.min_income::TEXT,
		'termsRef', c.terms_ref,
		'termsHash', c.terms_hash,
		'contractAddress', c.contract_address::TEXT,
		'tokenAddress', c.token_address::TEXT,
		'atsTokenAddress', c.ats_token_address::TEXT,
		'chainId', c.chain_id,
		'nextProofDueAt', c.next_proof_due_at,
		'graceUntil', c.grace_until,
		'ipoAt', c.ipo_at,
		'createdAt', c.created_at,
		'tranches', (
			SELECT coalesce(jsonb_agg(tranche_json(t) ORDER BY t.idx), '[]')
			FROM tranches t WHERE t.creator_id = c.id
		),
		'escrow', (
			SELECT jsonb_build_object(
				'locked', coalesce(sum(t.amount) FILTER (WHERE t.status = 'LOCKED'), 0)::TEXT,
				'released', coalesce(sum(t.amount) FILTER (WHERE t.status = 'RELEASED'), 0)::TEXT,
				'refunded', coalesce(sum(t.amount) FILTER (WHERE t.status = 'REFUNDED'), 0)::TEXT
			)
			FROM tranches t WHERE t.creator_id = c.id
		),
		'chain', jsonb_build_object(
			'pendingJobs', (
				SELECT count(*) FROM chain_jobs j
				WHERE j.creator_id = c.id AND j.status IN ('QUEUED', 'SENT')
			),
			'lastTxHash', (
				SELECT j.tx_hash FROM chain_jobs j
				WHERE j.creator_id = c.id AND j.tx_hash IS NOT NULL
				ORDER BY j.seq DESC LIMIT 1
			)
		)
	))
$function$;
CREATE OR REPLACE FUNCTION smx.demo_trigger_default(p_ticker text)
 RETURNS creators
 LANGUAGE plpgsql
 SET search_path TO 'smx', 'public'
AS $function$
DECLARE
	v_id UUID := creator_id_by_ticker(p_ticker);
	v_status creator_status;
BEGIN
	SELECT c.status INTO v_status FROM creators c WHERE c.id = v_id FOR UPDATE;
	PERFORM assert_that(
		v_status IN ('LIVE', 'GRACE'), 409, 'Creator is not live'
	);
	IF v_status = 'LIVE' THEN
		PERFORM emit_oracle_event(v_id, 'GRACE_STARTED', jsonb_build_object(
			'graceUntil', now()
		));
		PERFORM freeze_escrow(v_id, 'Proof deadline missed');
	END IF;
	UPDATE creators SET
		status = 'GRACE',
		next_proof_due_at = now() - interval '15 days',
		grace_until = now()
	WHERE id = v_id;
	RETURN liquidate_creator(v_id);
END;
$function$;
CREATE FUNCTION smx.dividend_splits_json(p_dividend uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'smx', 'public'
AS $function$
	SELECT coalesce(jsonb_agg(
		jsonb_build_object('wallet', s.wallet::TEXT, 'amount', s.amount::TEXT)
		ORDER BY s.amount DESC, s.wallet
	), '[]')
	FROM dividends d, pro_rata_split(d.creator_id, d.amount_due, 'HOLDINGS') s
	WHERE d.id = p_dividend
$function$;
CREATE FUNCTION smx.freeze_escrow(p_creator uuid, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'smx', 'public'
AS $function$
BEGIN
	PERFORM emit_oracle_event(p_creator, 'ESCROW_FROZEN', jsonb_build_object(
		'reason', p_reason
	));
	RETURN enqueue_chain_job(p_creator, 'freezeEscrow', '{}');
END;
$function$;
CREATE FUNCTION smx.launch_ipo(p_owner uuid, p_wallet evm_address, p_ticker text, p_display_name text, p_headline text, p_share_bps integer, p_term_months integer, p_target_raise money_amount, p_stake_amount money_amount, p_nullifier text, p_terms_ref text, p_terms_hash text, p_chain_id integer DEFAULT NULL::integer, p_tranche_bps integer[] DEFAULT ARRAY[2000, 4000, 4000])
 RETURNS creators
 LANGUAGE plpgsql
 SET search_path TO 'smx', 'public'
AS $function$
DECLARE
	v_creator creators;
	v_seed NUMERIC;
	v_n INTEGER := cardinality(p_tranche_bps);
BEGIN
	PERFORM assert_nullifier_available(p_nullifier);
	PERFORM assert_that(
		NOT EXISTS (SELECT 1 FROM creators c WHERE c.owner_user_id = p_owner),
		409, 'You have already launched an IPO'
	);
	PERFORM assert_that(
		NOT EXISTS (SELECT 1 FROM creators c WHERE c.ticker = p_ticker),
		409, 'That ticker is taken'
	);
	PERFORM assert_that(
		v_n BETWEEN 1 AND 12
			AND (SELECT sum(b) FROM unnest(p_tranche_bps) AS b) = 10000,
		400, 'Tranche schedule must sum to 10000 bps'
	);

	INSERT INTO creators(
		owner_user_id, owner_wallet, ticker, display_name, headline, share_bps,
		term_months, target_raise, stake_amount, status, world_id_nullifier,
		terms_ref, terms_hash, chain_id, ipo_at, next_proof_due_at,
		created_by
	)
	VALUES (
		p_owner, p_wallet, p_ticker, p_display_name, coalesce(p_headline, ''),
		p_share_bps, p_term_months, p_target_raise, p_stake_amount, 'LIVE',
		p_nullifier, p_terms_ref, p_terms_hash, p_chain_id,
		now(), now() + interval '30 days', p_owner
	)
	RETURNING * INTO v_creator;

	-- The last tranche takes the rounding remainder so they sum to the target.
	INSERT INTO tranches(creator_id, idx, amount, status, released_at)
	SELECT
		v_creator.id,
		t.idx - 1,
		CASE WHEN t.idx = v_n
			THEN p_target_raise - coalesce(sum(trunc(p_target_raise * t.bps / 10000, 6))
				OVER (ORDER BY t.idx ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0)
			ELSE trunc(p_target_raise * t.bps / 10000, 6) END,
		CASE WHEN t.idx = 1 THEN 'RELEASED'::tranche_status
			ELSE 'LOCKED'::tranche_status END,
		CASE WHEN t.idx = 1 THEN now() END
	FROM unnest(p_tranche_bps) WITH ORDINALITY AS t(bps, idx);

	-- Virtual liquidity: 10% of the target (min 100) on both sides, price 1.0.
	v_seed := greatest(trunc(p_target_raise / 10, 6), 100);
	INSERT INTO pools(creator_id, usdc_reserve, token_reserve)
	VALUES (v_creator.id, v_seed, v_seed);

	PERFORM emit_oracle_event(v_creator.id, 'IPO', jsonb_build_object(
		'displayName', p_display_name,
		'targetRaise', p_target_raise::TEXT,
		'shareBps', p_share_bps,
		'termMonths', p_term_months
	));

	PERFORM enqueue_chain_job(v_creator.id, 'createISA', jsonb_build_object(
		'ticker', p_ticker,
		'creatorWallet', p_wallet::TEXT,
		'shareBps', p_share_bps,
		'termMonths', p_term_months,
		'targetRaise', p_target_raise::TEXT,
		'stakeAmount', p_stake_amount::TEXT,
		'trancheBps', to_jsonb(p_tranche_bps),
		'termsHash', p_terms_hash,
		'termsRef', p_terms_ref,
		'worldIdNullifier', p_nullifier
	));
	PERFORM enqueue_chain_job(v_creator.id, 'initializeIPO', jsonb_build_object(
		'stakeAmount', p_stake_amount::TEXT
	));

	RETURN v_creator;
END;
$function$;
CREATE FUNCTION smx.submit_income_proof(p_creator uuid, p_provider text, p_reclaim_proof_id text, p_amount money_amount, p_raw jsonb DEFAULT NULL::jsonb, p_period integer DEFAULT NULL::integer, p_reclaim_session_id text DEFAULT NULL::text)
 RETURNS income_proofs
 LANGUAGE plpgsql
 SET search_path TO 'smx', 'public'
AS $function$
DECLARE
	v_status creator_status;
	v_proof income_proofs;
BEGIN
	SELECT c.status INTO v_status FROM creators c WHERE c.id = p_creator;
	PERFORM assert_that(FOUND, 404, 'Creator not found');
	PERFORM assert_that(
		v_status IN ('LIVE', 'GRACE'), 409, 'This creator is not accepting proofs'
	);
	PERFORM assert_that(
		NOT EXISTS (
			SELECT 1 FROM income_proofs ip
			WHERE ip.creator_id = p_creator AND ip.reclaim_proof_id = p_reclaim_proof_id
		),
		409, 'This proof was already submitted'
	);

	INSERT INTO income_proofs(
		creator_id, period, provider, reclaim_proof_id, verified_amount, raw,
		reclaim_session_id
	)
	VALUES (
		p_creator,
		coalesce(p_period, (
			SELECT count(*)::INTEGER FROM income_proofs ip
			WHERE ip.creator_id = p_creator AND ip.status = 'APPROVED'
		)),
		p_provider, p_reclaim_proof_id, p_amount, p_raw, p_reclaim_session_id
	)
	RETURNING * INTO v_proof;

	UPDATE reclaim_sessions SET status = 'SUCCESS', proof_id = v_proof.id
	WHERE id = p_reclaim_session_id AND creator_id = p_creator;
	RETURN v_proof;
END;
$function$;
CREATE OR REPLACE FUNCTION smx.sweep_deadlines(p_now timestamp with time zone DEFAULT now())
 RETURNS TABLE(creator_id uuid, transition text)
 LANGUAGE plpgsql
 SET search_path TO 'smx', 'public'
AS $function$
DECLARE
	r RECORD;
BEGIN
	FOR r IN
		SELECT c.id, c.status, c.ipo_at, c.term_months, c.next_proof_due_at,
			c.grace_until
		FROM creators c
		WHERE c.status IN ('LIVE', 'GRACE')
		ORDER BY c.id
		FOR UPDATE SKIP LOCKED
	LOOP
		IF r.status = 'GRACE' AND r.grace_until < p_now THEN
			PERFORM liquidate_creator(r.id);
			creator_id := r.id; transition := 'DEFAULTED'; RETURN NEXT;
		ELSIF r.status = 'LIVE'
			AND r.ipo_at + make_interval(months => r.term_months) < p_now THEN
			UPDATE creators SET status = 'COMPLETED' WHERE id = r.id;
			creator_id := r.id; transition := 'COMPLETED'; RETURN NEXT;
		ELSIF r.status = 'LIVE' AND r.next_proof_due_at < p_now THEN
			UPDATE creators SET
				status = 'GRACE', grace_until = p_now + interval '14 days'
			WHERE id = r.id;
			PERFORM emit_oracle_event(r.id, 'GRACE_STARTED', jsonb_build_object(
				'graceUntil', p_now + interval '14 days'
			));
			PERFORM freeze_escrow(r.id, 'Proof deadline missed');
			creator_id := r.id; transition := 'GRACE'; RETURN NEXT;
		END IF;
	END LOOP;
END;
$function$;
ALTER TABLE smx.chain_jobs ADD CONSTRAINT chain_jobs_fn_check CHECK (fn = ANY (ARRAY['createISA'::text, 'initializeIPO'::text, 'invest'::text, 'unlockNextTranche'::text, 'distributeDividend'::text, 'executeLiquidation'::text, 'freezeEscrow'::text, 'unfreezeEscrow'::text]));
ALTER TABLE smx.creators ADD COLUMN ats_token_address evm_address;
ALTER TABLE smx.income_proofs ADD COLUMN reclaim_session_id text;
ALTER TABLE smx.income_proofs ADD CONSTRAINT income_proofs_reclaim_session_id_check CHECK (length(reclaim_session_id) <= 200);
CREATE TABLE smx.reclaim_sessions (id text NOT NULL, creator_id uuid NOT NULL, org_id text, status reclaim_session_status DEFAULT 'PENDING'::reclaim_session_status NOT NULL, failure_reason text, proof_id uuid, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE FUNCTION smx.finish_reclaim_session(p_session text, p_status reclaim_session_status, p_reason text DEFAULT NULL::text)
 RETURNS reclaim_sessions
 LANGUAGE plpgsql
 SET search_path TO 'smx', 'public'
AS $function$
DECLARE
	v_row reclaim_sessions;
BEGIN
	UPDATE reclaim_sessions SET
		status = p_status, failure_reason = left(p_reason, 500)
	WHERE id = p_session AND status = 'PENDING'
	RETURNING * INTO v_row;
	IF NOT FOUND THEN
		SELECT * INTO v_row FROM reclaim_sessions WHERE id = p_session;
	END IF;
	RETURN v_row;
END;
$function$;
CREATE FUNCTION smx.reclaim_session_json(r reclaim_sessions)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'smx', 'public'
AS $function$
	SELECT jsonb_strip_nulls(jsonb_build_object(
		'sessionId', r.id,
		'creatorId', r.creator_id,
		'status', r.status,
		'failureReason', r.failure_reason,
		'proofId', r.proof_id,
		'proofStatus', (SELECT p.status FROM income_proofs p WHERE p.id = r.proof_id),
		'createdAt', r.created_at,
		'updatedAt', r.updated_at
	))
$function$;
ALTER TABLE smx.reclaim_sessions ADD CONSTRAINT reclaim_sessions_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES creators(id) ON DELETE CASCADE;
ALTER TABLE smx.reclaim_sessions ADD CONSTRAINT reclaim_sessions_failure_reason_check CHECK (length(failure_reason) <= 500);
ALTER TABLE smx.reclaim_sessions ADD CONSTRAINT reclaim_sessions_id_check CHECK (length(id) >= 1 AND length(id) <= 200);
ALTER TABLE smx.reclaim_sessions ADD CONSTRAINT reclaim_sessions_org_id_check CHECK (length(org_id) <= 200);
ALTER TABLE smx.reclaim_sessions ADD CONSTRAINT reclaim_sessions_pkey PRIMARY KEY (id);
ALTER TABLE smx.reclaim_sessions ADD CONSTRAINT reclaim_sessions_proof_id_fkey FOREIGN KEY (proof_id) REFERENCES income_proofs(id);
CREATE INDEX reclaim_sessions_creator_idx ON reclaim_sessions (creator_id, created_at DESC);
CREATE TRIGGER reclaim_sessions_touch_updated_at BEFORE UPDATE ON reclaim_sessions FOR EACH ROW EXECUTE FUNCTION touch_updated_at();