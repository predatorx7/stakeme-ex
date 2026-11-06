-- Planned by `npm run migrate:plan`, then edited by hand: the two SET lines
-- (unqualified types need smx on the path) and the data fix at the end.
SET search_path TO smx, public;
SET check_function_bodies = off;

DROP FUNCTION smx.audit_income_proof(p_proof uuid, p_verified_amount money_amount, p_audit jsonb);
DROP FUNCTION smx.launch_ipo(p_owner uuid, p_wallet evm_address, p_ticker text, p_display_name text, p_headline text, p_share_bps integer, p_term_months integer, p_target_raise money_amount, p_stake_amount money_amount, p_nullifier text, p_terms_ref text, p_terms_hash text, p_chain_id integer, p_tranche_bps integer[]);
ALTER TYPE smx.oracle_event_kind ADD VALUE 'STORAGE_CONFIRMED' AFTER 'ESCROW_UNFROZEN';
CREATE TYPE smx.storage_upload_kind AS ENUM ('LISA_TERMS', 'AUDIT_LOG');
CREATE TYPE smx.storage_upload_status AS ENUM ('QUEUED', 'UPLOADED', 'FAILED', 'SKIPPED');
CREATE FUNCTION smx.audit_income_proof(p_proof uuid, p_verified_amount money_amount, p_audit jsonb DEFAULT '{}'::jsonb, p_log_document jsonb DEFAULT NULL::jsonb)
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
		PERFORM enqueue_storage_upload(
			v_creator.id, 'AUDIT_LOG', p_proof, p_log_document,
			substring(p_audit ->> 'logRef' FROM '^local:([0-9a-f]{64})$')
		);
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

	-- The log ref is `local:<sha256>` until the worker uploads the document.
	PERFORM enqueue_storage_upload(
		v_creator.id, 'AUDIT_LOG', p_proof, p_log_document,
		substring(p_audit ->> 'logRef' FROM '^local:([0-9a-f]{64})$')
	);

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
		'termsStorage', storage_status('LISA_TERMS', c.id),
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
CREATE OR REPLACE FUNCTION smx.emit_oracle_event(p_creator uuid, p_kind oracle_event_kind, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS oracle_events
 LANGUAGE plpgsql
 SET search_path TO 'smx', 'public'
AS $function$
DECLARE
	v_event oracle_events;
BEGIN
	INSERT INTO oracle_events(creator_id, kind, payload)
	SELECT c.id, p_kind, jsonb_build_object('ticker', c.ticker) || p_payload
	FROM creators c WHERE c.id = p_creator
	RETURNING * INTO v_event;

	INSERT INTO price_ticks(creator_id, price)
	SELECT p_creator, pool_price(p_creator)
	WHERE pool_price(p_creator) IS NOT NULL AND p_kind <> 'STORAGE_CONFIRMED';

	RETURN v_event;
END;
$function$;
CREATE OR REPLACE FUNCTION smx.income_proof_json(p income_proofs)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'smx', 'public'
AS $function$
	SELECT jsonb_strip_nulls(jsonb_build_object(
		'id', p.id,
		'creatorId', p.creator_id,
		'ticker', (SELECT c.ticker FROM creators c WHERE c.id = p.creator_id),
		'period', p.period,
		'provider', p.provider,
		'reclaimProofId', p.reclaim_proof_id,
		'verifiedAmount', p.verified_amount::TEXT,
		'status', p.status,
		'reasoning', p.audit ->> 'reasoning',
		'rejectReason', p.audit ->> 'reason',
		'model', p.audit ->> 'model',
		'auditLogRef', p.audit_log_ref,
		'auditLogStorage', storage_status('AUDIT_LOG', p.id),
		'createdAt', p.created_at
	))
$function$;
CREATE FUNCTION smx.launch_ipo(p_owner uuid, p_wallet evm_address, p_ticker text, p_display_name text, p_headline text, p_share_bps integer, p_term_months integer, p_target_raise money_amount, p_stake_amount money_amount, p_nullifier text, p_terms_ref text, p_terms_hash text, p_chain_id integer DEFAULT NULL::integer, p_terms_document jsonb DEFAULT NULL::jsonb, p_tranche_bps integer[] DEFAULT ARRAY[2000, 4000, 4000])
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

	-- The terms ref is `local:<sha256>` until the worker uploads the document.
	PERFORM enqueue_storage_upload(
		v_creator.id, 'LISA_TERMS', v_creator.id, p_terms_document,
		substring(p_terms_ref FROM '^local:([0-9a-f]{64})$')
	);

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
CREATE FUNCTION smx.storage_status(p_kind storage_upload_kind, p_owner uuid)
 RETURNS text
 LANGUAGE sql
 SET search_path TO 'smx', 'public'
AS $function$
	SELECT CASE u.status WHEN 'QUEUED' THEN 'PENDING' ELSE u.status::TEXT END
	FROM storage_uploads u
	WHERE u.kind = p_kind AND u.owner_id = p_owner
	ORDER BY u.seq DESC LIMIT 1
$function$;
CREATE TABLE smx.storage_uploads (id uuid DEFAULT gen_random_uuid() NOT NULL, seq bigint GENERATED ALWAYS AS IDENTITY NOT NULL, creator_id uuid NOT NULL, kind storage_upload_kind NOT NULL, owner_id uuid NOT NULL, document jsonb NOT NULL, content_hash text NOT NULL, status storage_upload_status DEFAULT 'QUEUED'::storage_upload_status NOT NULL, ref text, error text, attempts integer DEFAULT 0 NOT NULL, next_attempt_at timestamp with time zone DEFAULT now() NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE FUNCTION smx.claim_storage_upload(p_id uuid)
 RETURNS storage_uploads
 LANGUAGE plpgsql
 SET search_path TO 'smx', 'public'
AS $function$
DECLARE
	v_row storage_uploads;
	v_done storage_uploads;
BEGIN
	UPDATE storage_uploads u SET
		attempts = u.attempts + 1,
		next_attempt_at = now() + interval '5 minutes'
	WHERE u.id = p_id AND u.status = 'QUEUED' AND u.next_attempt_at <= now()
	RETURNING * INTO v_row;
	IF NOT FOUND THEN
		RETURN NULL;
	END IF;

	SELECT * INTO v_done FROM storage_uploads u
	WHERE u.content_hash = v_row.content_hash AND u.status = 'UPLOADED'
	ORDER BY u.seq LIMIT 1;
	IF FOUND THEN
		RETURN complete_storage_upload(p_id, 'UPLOADED', v_done.ref);
	END IF;

	RETURN v_row;
END;
$function$;
CREATE FUNCTION smx.complete_storage_upload(p_id uuid, p_status storage_upload_status, p_ref text DEFAULT NULL::text, p_error text DEFAULT NULL::text, p_transient boolean DEFAULT false)
 RETURNS storage_uploads
 LANGUAGE plpgsql
 SET search_path TO 'smx', 'public'
AS $function$
DECLARE
	v_row storage_uploads;
	v_local TEXT;
BEGIN
	SELECT * INTO v_row FROM storage_uploads u
	WHERE u.id = p_id AND u.status = 'QUEUED' FOR UPDATE;
	IF NOT FOUND THEN
		SELECT * INTO v_row FROM storage_uploads u WHERE u.id = p_id;
		RETURN v_row;
	END IF;

	IF p_status = 'FAILED' AND p_transient AND v_row.attempts < 3 THEN
		UPDATE storage_uploads u SET
			error = left(p_error, 2000),
			next_attempt_at = now() + interval '30 seconds' * power(4, greatest(v_row.attempts - 1, 0))
		WHERE u.id = p_id
		RETURNING * INTO v_row;
		RETURN v_row;
	END IF;

	UPDATE storage_uploads u SET
		status = p_status,
		ref = CASE WHEN p_status = 'UPLOADED' THEN p_ref END,
		error = CASE WHEN p_status = 'FAILED' THEN left(p_error, 2000) END
	WHERE u.id = p_id
	RETURNING * INTO v_row;

	IF p_status = 'UPLOADED' THEN
		PERFORM assert_that(p_ref IS NOT NULL, 400, 'Upload has no ref');
		v_local := 'local:' || v_row.content_hash;
		IF v_row.kind = 'LISA_TERMS' THEN
			UPDATE creators c SET terms_ref = p_ref
			WHERE c.id = v_row.owner_id AND c.terms_ref = v_local;
		ELSE
			UPDATE income_proofs ip SET audit_log_ref = p_ref
			WHERE ip.id = v_row.owner_id AND ip.audit_log_ref = v_local;
		END IF;

		PERFORM emit_oracle_event(v_row.creator_id, 'STORAGE_CONFIRMED',
			jsonb_build_object(
				'kind', v_row.kind,
				'ref', p_ref,
				'contentHash', v_row.content_hash,
				'url', 'https://storagescan-galileo.0g.ai/tool/file?root=' || p_ref
			));
	END IF;

	RETURN v_row;
END;
$function$;
CREATE FUNCTION smx.enqueue_storage_upload(p_creator uuid, p_kind storage_upload_kind, p_owner uuid, p_document jsonb, p_content_hash text)
 RETURNS storage_uploads
 LANGUAGE plpgsql
 SET search_path TO 'smx', 'public'
AS $function$
DECLARE
	v_row storage_uploads;
	v_done storage_uploads;
BEGIN
	IF p_document IS NULL OR p_content_hash IS NULL THEN
		RETURN NULL;
	END IF;

	INSERT INTO storage_uploads(creator_id, kind, owner_id, document, content_hash)
	VALUES (p_creator, p_kind, p_owner, p_document, p_content_hash)
	RETURNING * INTO v_row;

	SELECT * INTO v_done FROM storage_uploads u
	WHERE u.content_hash = p_content_hash AND u.status = 'UPLOADED'
	ORDER BY u.seq LIMIT 1;
	IF FOUND THEN
		v_row := complete_storage_upload(v_row.id, 'UPLOADED', v_done.ref);
	END IF;

	RETURN v_row;
END;
$function$;
ALTER TABLE smx.storage_uploads ADD CONSTRAINT storage_uploads_content_hash_check CHECK (content_hash ~ '^[0-9a-f]{64}$'::text);
ALTER TABLE smx.storage_uploads ADD CONSTRAINT storage_uploads_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES creators(id) ON DELETE CASCADE;
ALTER TABLE smx.storage_uploads ADD CONSTRAINT storage_uploads_error_check CHECK (length(error) <= 2000);
ALTER TABLE smx.storage_uploads ADD CONSTRAINT storage_uploads_pkey PRIMARY KEY (id);
ALTER TABLE smx.storage_uploads ADD CONSTRAINT storage_uploads_ref_check CHECK (length(ref) <= 200);
CREATE INDEX storage_uploads_queue_idx ON storage_uploads (seq) WHERE status = 'QUEUED'::storage_upload_status;
CREATE INDEX storage_uploads_hash_idx ON storage_uploads (content_hash) WHERE status = 'UPLOADED'::storage_upload_status;
CREATE INDEX storage_uploads_owner_idx ON storage_uploads (kind, owner_id, seq DESC);
CREATE TRIGGER post_insert_event AFTER INSERT ON storage_uploads REFERENCING NEW TABLE AS new FOR EACH STATEMENT EXECUTE FUNCTION pgmb.push_table_event();
CREATE TRIGGER storage_uploads_touch_updated_at BEFORE UPDATE ON storage_uploads FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
-- Hedera mirror-node lag right after a deployment fails reads with
-- FAIL_INVALID; requeue those chain jobs (they never reached the chain).
UPDATE smx.chain_jobs SET status = 'QUEUED', error = NULL, updated_at = now()
WHERE status = 'FAILED' AND error LIKE '%FAIL_INVALID%';
