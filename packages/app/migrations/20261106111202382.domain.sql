-- Planned by `npm run migrate:plan`. The two SET lines are the only manual
-- edit: unqualified types need smx on the path, and the planner emits SQL
-- functions before the tables they read (check_function_bodies = off).
SET search_path TO smx, public;
SET check_function_bodies = off;

CREATE TYPE smx.chain_job_status AS ENUM ('QUEUED', 'SENT', 'CONFIRMED', 'FAILED', 'SIMULATED');
CREATE TYPE smx.creator_status AS ENUM ('DRAFT', 'LIVE', 'GRACE', 'DEFAULTED', 'COMPLETED');
CREATE TYPE smx.dividend_status AS ENUM ('DUE', 'PAID');
CREATE TYPE smx.oracle_event_kind AS ENUM ('IPO', 'INVESTED', 'PROOF_VERIFIED', 'PROOF_REJECTED', 'TRANCHE_RELEASED', 'DIVIDEND_PAID', 'GRACE_STARTED', 'DEFAULTED', 'TRADE');
CREATE TYPE smx.payout_kind AS ENUM ('DIVIDEND', 'REFUND', 'SLASH');
CREATE TYPE smx.proof_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE smx.trade_side AS ENUM ('BUY', 'SELL');
CREATE TYPE smx.tranche_status AS ENUM ('LOCKED', 'RELEASED', 'REFUNDED');
CREATE FUNCTION smx.assert_creator_owner(p_creator uuid, p_user uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'smx', 'public'
AS $function$
BEGIN
	RETURN assert_that(
		EXISTS (
			SELECT 1 FROM creators c
			WHERE c.id = p_creator AND c.owner_user_id = p_user
		),
		403, 'Only the creator can do this'
	);
END;
$function$;
CREATE FUNCTION smx.assert_nullifier_available(p_nullifier text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'smx', 'public'
AS $function$
BEGIN
	PERFORM assert_that(
		NOT EXISTS (
			SELECT 1 FROM blacklisted_nullifiers b WHERE b.nullifier = p_nullifier
		),
		403, 'This World ID is blacklisted after a default'
	);
	PERFORM assert_that(
		NOT EXISTS (
			SELECT 1 FROM creators c WHERE c.world_id_nullifier = p_nullifier
		),
		409, 'This World ID has already launched an IPO'
	);
	RETURN TRUE;
END;
$function$;
CREATE FUNCTION smx.creator_change_24h(p_creator uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO 'smx', 'public'
AS $function$
	WITH base AS (
		SELECT coalesce(
			(
				SELECT t.price FROM price_ticks t
				WHERE t.creator_id = p_creator AND t.at <= now() - interval '24 hours'
				ORDER BY t.at DESC LIMIT 1
			),
			(
				SELECT t.price FROM price_ticks t
				WHERE t.creator_id = p_creator ORDER BY t.at ASC LIMIT 1
			)
		) AS price
	)
	SELECT coalesce(
		round((pool_price(p_creator) - base.price) / nullif(base.price, 0) * 100, 2),
		0
	)
	FROM base
$function$;
CREATE FUNCTION smx.creator_hub_json(p_user uuid)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'smx', 'public'
AS $function$
	SELECT coalesce((
		SELECT jsonb_strip_nulls(jsonb_build_object(
			'creator', creator_json(c),
			'pendingDividend', (
				SELECT dividend_json(d) FROM dividends d
				WHERE d.creator_id = c.id AND d.status = 'DUE'
				ORDER BY d.created_at LIMIT 1
			),
			'dividends', (
				SELECT coalesce(jsonb_agg(dividend_json(d) ORDER BY d.created_at DESC, d.id), '[]')
				FROM dividends d
			WHERE d.id IN (SELECT y.id FROM dividends y WHERE y.creator_id = c.id ORDER BY y.created_at DESC, y.id LIMIT 10)
			),
			'proofs', (
				SELECT coalesce(jsonb_agg(income_proof_json(p) ORDER BY p.created_at DESC, p.id), '[]')
				FROM income_proofs p
			WHERE p.id IN (SELECT y.id FROM income_proofs y WHERE y.creator_id = c.id ORDER BY y.created_at DESC, y.id LIMIT 10)
			),
			'chainJobs', (
				SELECT coalesce(jsonb_agg(chain_job_json(j) ORDER BY j.seq DESC), '[]')
				FROM chain_jobs j
			WHERE j.id IN (SELECT y.id FROM chain_jobs y WHERE y.creator_id = c.id ORDER BY y.seq DESC LIMIT 10)
			),
			'collateral', jsonb_build_object(
				'stakeAmount', c.stake_amount::TEXT,
				'atRisk', c.status IN ('LIVE', 'GRACE')
			)
		))
		FROM creators c WHERE c.owner_user_id = p_user
	), '{}'::JSONB)
$function$;
CREATE FUNCTION smx.creator_id_by_ticker(p_ticker text)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'smx', 'public'
AS $function$
DECLARE
	v_id UUID;
BEGIN
	SELECT c.id INTO v_id FROM creators c WHERE c.ticker = p_ticker;
	PERFORM assert_that(v_id IS NOT NULL, 404, 'Creator not found');
	RETURN v_id;
END;
$function$;
CREATE FUNCTION smx.creator_page_json(p_ticker text, p_wallet text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'smx', 'public'
AS $function$
	SELECT jsonb_strip_nulls(jsonb_build_object(
		'creator', creator_json(c),
		'chart', price_points_json(c.id, 500),
		'holders', (
			SELECT coalesce(jsonb_agg(holding_json(h) ORDER BY h.balance DESC, h.wallet), '[]')
			FROM holdings h
			WHERE (ROW(h.creator_id, h.wallet)) IN (SELECT y.creator_id, y.wallet FROM holdings y WHERE y.creator_id = c.id AND y.balance > 0 ORDER BY y.balance DESC, y.wallet LIMIT 20)
		),
		'trades', (
			SELECT coalesce(jsonb_agg(trade_json(t) ORDER BY t.created_at DESC, t.id), '[]')
			FROM trades t
			WHERE t.id IN (SELECT y.id FROM trades y WHERE y.creator_id = c.id ORDER BY y.created_at DESC, y.id LIMIT 20)
		),
		'events', (
			SELECT coalesce(jsonb_agg(oracle_event_json(e) ORDER BY e.created_at DESC, e.id), '[]')
			FROM oracle_events e
			WHERE e.id IN (SELECT y.id FROM oracle_events y WHERE y.creator_id = c.id ORDER BY y.created_at DESC, y.id LIMIT 20)
		),
		'proofs', (
			SELECT coalesce(jsonb_agg(income_proof_json(p) ORDER BY p.created_at DESC, p.id), '[]')
			FROM income_proofs p
			WHERE p.id IN (SELECT y.id FROM income_proofs y WHERE y.creator_id = c.id ORDER BY y.created_at DESC, y.id LIMIT 10)
		),
		'dividends', (
			SELECT coalesce(jsonb_agg(dividend_json(d) ORDER BY d.created_at DESC, d.id), '[]')
			FROM dividends d
			WHERE d.id IN (SELECT y.id FROM dividends y WHERE y.creator_id = c.id ORDER BY y.created_at DESC, y.id LIMIT 10)
		),
		'viewer', jsonb_build_object(
			'wallet', p_wallet,
			'holding', (
				SELECT holding_json(h) FROM holdings h
				WHERE h.creator_id = c.id AND h.wallet = p_wallet::evm_address
			)
		)
	))
	FROM creators c WHERE c.ticker = p_ticker
$function$;
CREATE FUNCTION smx.demo_spread_history(p_creator uuid, p_span interval)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'smx', 'public'
AS $function$
DECLARE
	v_start TIMESTAMPTZ := clock_timestamp() - p_span;
BEGIN
	UPDATE price_ticks t SET at = v_start + p_span * ((r.rn - 1)::DOUBLE PRECISION / r.n)
	FROM (
		SELECT id, row_number() OVER (ORDER BY at, id) AS rn, count(*) OVER () AS n
		FROM price_ticks WHERE creator_id = p_creator
	) r WHERE t.id = r.id;

	UPDATE oracle_events e SET created_at = v_start + p_span * ((r.rn - 1)::DOUBLE PRECISION / r.n)
	FROM (
		SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn, count(*) OVER () AS n
		FROM oracle_events WHERE creator_id = p_creator
	) r WHERE e.id = r.id;

	UPDATE trades t SET created_at = v_start + p_span * ((r.rn - 1)::DOUBLE PRECISION / r.n)
	FROM (
		SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn, count(*) OVER () AS n
		FROM trades WHERE creator_id = p_creator
	) r WHERE t.id = r.id;

	UPDATE investments i SET created_at = v_start + p_span * ((r.rn - 1)::DOUBLE PRECISION / r.n)
	FROM (
		SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn, count(*) OVER () AS n
		FROM investments WHERE creator_id = p_creator
	) r WHERE i.id = r.id;

	UPDATE creators SET
		ipo_at = v_start,
		next_proof_due_at = next_proof_due_at - p_span
	WHERE id = p_creator;
END;
$function$;
CREATE FUNCTION smx.enqueue_chain_job(p_creator uuid, p_fn text, p_args jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO 'smx', 'public'
AS $function$
	INSERT INTO chain_jobs(creator_id, fn, args)
	VALUES (p_creator, p_fn, p_args)
	RETURNING id
$function$;
CREATE FUNCTION smx.exchange_json(p_limit integer)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'smx', 'public'
AS $function$
	SELECT jsonb_build_object(
		'trending', (
			SELECT coalesce(jsonb_agg(creator_summary_json(t.c) ORDER BY t.rank), '[]')
			FROM (
				SELECT c, row_number() OVER (
					ORDER BY (c.status IN ('LIVE', 'GRACE')) DESC,
						(SELECT coalesce(sum(tr.usdc_amount), 0) FROM trades tr
							WHERE tr.creator_id = c.id
								AND tr.created_at > now() - interval '24 hours') DESC,
						c.raised_amount DESC, c.ticker
				) AS rank
				FROM creators c WHERE c.status <> 'DRAFT'
			) t
			WHERE t.rank <= p_limit
		),
		'events', (
			SELECT coalesce(jsonb_agg(oracle_event_json(e) ORDER BY e.created_at DESC, e.id), '[]')
			FROM oracle_events e
			WHERE e.id IN (SELECT y.id FROM oracle_events y  ORDER BY created_at DESC, id LIMIT 20)
		)
	)
$function$;
CREATE FUNCTION smx.pool_price(p_creator uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO 'smx', 'public'
AS $function$
	SELECT trunc(p.usdc_reserve / p.token_reserve, 18)
	FROM pools p WHERE p.creator_id = p_creator
$function$;
CREATE FUNCTION smx.price_points_json(p_creator uuid, p_limit integer)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'smx', 'public'
AS $function$
	SELECT coalesce(jsonb_agg(
		jsonb_build_object('at', t.at, 'price', t.price::TEXT) ORDER BY t.at
	), '[]')
	FROM (
		SELECT pt.at, pt.price FROM price_ticks pt
		WHERE pt.creator_id = p_creator
		ORDER BY pt.at DESC LIMIT p_limit
	) t
$function$;
CREATE FUNCTION smx.pro_rata_split(p_creator uuid, p_total numeric, p_basis text)
 RETURNS TABLE(wallet evm_address, amount numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'smx', 'public'
AS $function$
	WITH weights AS (
		SELECT h.wallet, h.balance::NUMERIC AS w
		FROM holdings h
		WHERE p_basis = 'HOLDINGS' AND h.creator_id = p_creator AND h.balance > 0
		UNION ALL
		SELECT i.wallet, sum(i.usdc_amount)::NUMERIC AS w
		FROM investments i
		WHERE p_basis = 'INVESTED' AND i.creator_id = p_creator
		GROUP BY i.wallet
	),
	total AS (SELECT sum(w) AS t FROM weights),
	parts AS (
		SELECT
			weights.wallet,
			trunc(p_total * weights.w / total.t, 6) AS amt,
			row_number() OVER (ORDER BY weights.w DESC, weights.wallet) AS rn
		FROM weights, total
		WHERE total.t > 0
	)
	SELECT
		parts.wallet,
		parts.amt + CASE WHEN parts.rn = 1
			THEN p_total - (SELECT sum(amt) FROM parts) ELSE 0 END
	FROM parts
	WHERE parts.amt > 0 OR parts.rn = 1
$function$;
CREATE FUNCTION smx.sweep_deadlines(p_now timestamp with time zone DEFAULT now())
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
			creator_id := r.id; transition := 'GRACE'; RETURN NEXT;
		END IF;
	END LOOP;
END;
$function$;
CREATE TABLE smx.blacklisted_nullifiers (nullifier text NOT NULL, creator_id uuid, reason text DEFAULT 'DEFAULTED'::text NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE smx.blacklisted_nullifiers ADD CONSTRAINT blacklisted_nullifiers_pkey PRIMARY KEY (nullifier);
CREATE TABLE smx.chain_jobs (id uuid DEFAULT gen_random_uuid() NOT NULL, seq bigint GENERATED ALWAYS AS IDENTITY NOT NULL, creator_id uuid NOT NULL, fn text NOT NULL, args jsonb DEFAULT '{}'::jsonb NOT NULL, status chain_job_status DEFAULT 'QUEUED'::chain_job_status NOT NULL, tx_hash tx_hash, error text, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE FUNCTION smx.chain_job_json(j chain_jobs)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'smx', 'public'
AS $function$
	SELECT jsonb_strip_nulls(jsonb_build_object(
		'id', j.id,
		'creatorId', j.creator_id,
		'fn', j.fn,
		'status', j.status,
		'txHash', j.tx_hash,
		'error', j.error,
		'createdAt', j.created_at,
		'updatedAt', j.updated_at
	))
$function$;
CREATE FUNCTION smx.complete_chain_job(p_job uuid, p_status chain_job_status, p_tx_hash tx_hash DEFAULT NULL::text, p_error text DEFAULT NULL::text, p_isa evm_address DEFAULT NULL::citext, p_token evm_address DEFAULT NULL::citext)
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
			UPDATE creators SET contract_address = p_isa, token_address = p_token
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
ALTER TABLE smx.chain_jobs ADD CONSTRAINT chain_jobs_error_check CHECK (length(error) <= 2000);
ALTER TABLE smx.chain_jobs ADD CONSTRAINT chain_jobs_fn_check CHECK (fn = ANY (ARRAY['createISA'::text, 'initializeIPO'::text, 'invest'::text, 'unlockNextTranche'::text, 'distributeDividend'::text, 'executeLiquidation'::text]));
ALTER TABLE smx.chain_jobs ADD CONSTRAINT chain_jobs_pkey PRIMARY KEY (id);
CREATE INDEX chain_jobs_queue_idx ON chain_jobs (seq) WHERE status = 'QUEUED'::chain_job_status;
CREATE INDEX chain_jobs_creator_idx ON chain_jobs (creator_id, seq DESC);
CREATE TRIGGER chain_jobs_touch_updated_at BEFORE UPDATE ON chain_jobs FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER post_insert_event AFTER INSERT ON chain_jobs REFERENCING NEW TABLE AS new FOR EACH STATEMENT EXECUTE FUNCTION pgmb.push_table_event();
CREATE TRIGGER post_update_event AFTER UPDATE ON chain_jobs REFERENCING OLD TABLE AS old NEW TABLE AS new FOR EACH STATEMENT EXECUTE FUNCTION pgmb.push_table_event();
CREATE TABLE smx.creators (id uuid DEFAULT gen_random_uuid() NOT NULL, owner_user_id uuid NOT NULL, owner_wallet evm_address NOT NULL, ticker text NOT NULL, display_name text NOT NULL, headline text DEFAULT ''::text NOT NULL, share_bps integer DEFAULT 500 NOT NULL, term_months integer DEFAULT 60 NOT NULL, target_raise money_amount NOT NULL, stake_amount money_amount NOT NULL, min_income money_amount DEFAULT 1000 NOT NULL, raised_amount money_amount DEFAULT 0 NOT NULL, status creator_status DEFAULT 'DRAFT'::creator_status NOT NULL, world_id_nullifier text NOT NULL, arkiv_entity_key text, terms_hash text, contract_address evm_address, token_address evm_address, chain_id integer, next_proof_due_at timestamp with time zone, grace_until timestamp with time zone, ipo_at timestamp with time zone, created_at timestamp with time zone DEFAULT now() NOT NULL, created_by uuid, updated_at timestamp with time zone DEFAULT now() NOT NULL, updated_by uuid);
CREATE FUNCTION smx.creator_json(c creators)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'smx', 'public'
AS $function$
	SELECT creator_summary_json(c) || jsonb_strip_nulls(jsonb_build_object(
		'ownerWallet', c.owner_wallet::TEXT,
		'termMonths', c.term_months,
		'stakeAmount', c.stake_amount::TEXT,
		'minIncome', c.min_income::TEXT,
		'arkivEntityKey', c.arkiv_entity_key,
		'termsHash', c.terms_hash,
		'contractAddress', c.contract_address::TEXT,
		'tokenAddress', c.token_address::TEXT,
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
CREATE FUNCTION smx.creator_summary_json(c creators)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'smx', 'public'
AS $function$
	SELECT jsonb_strip_nulls(jsonb_build_object(
		'id', c.id,
		'ticker', c.ticker,
		'displayName', c.display_name,
		'headline', c.headline,
		'status', c.status,
		'price', coalesce(pool_price(c.id), 0)::TEXT,
		'change24h', creator_change_24h(c.id),
		'volume24h', (
			SELECT coalesce(sum(t.usdc_amount), 0)::TEXT FROM trades t
			WHERE t.creator_id = c.id AND t.created_at > now() - interval '24 hours'
		),
		'raised', c.raised_amount::TEXT,
		'targetRaise', c.target_raise::TEXT,
		'shareBps', c.share_bps,
		'sparkline', price_points_json(c.id, 30)
	))
$function$;
CREATE FUNCTION smx.demo_trigger_default(p_ticker text)
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
	END IF;
	UPDATE creators SET
		status = 'GRACE',
		next_proof_due_at = now() - interval '15 days',
		grace_until = now()
	WHERE id = v_id;
	RETURN liquidate_creator(v_id);
END;
$function$;
CREATE FUNCTION smx.launch_ipo(p_owner uuid, p_wallet evm_address, p_ticker text, p_display_name text, p_headline text, p_share_bps integer, p_term_months integer, p_target_raise money_amount, p_stake_amount money_amount, p_nullifier text, p_arkiv_entity_key text, p_terms_hash text, p_chain_id integer DEFAULT NULL::integer, p_tranche_bps integer[] DEFAULT ARRAY[2000, 4000, 4000])
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
		arkiv_entity_key, terms_hash, chain_id, ipo_at, next_proof_due_at,
		created_by
	)
	VALUES (
		p_owner, p_wallet, p_ticker, p_display_name, coalesce(p_headline, ''),
		p_share_bps, p_term_months, p_target_raise, p_stake_amount, 'LIVE',
		p_nullifier, p_arkiv_entity_key, p_terms_hash, p_chain_id,
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
		'termsHash', p_terms_hash
	));
	PERFORM enqueue_chain_job(v_creator.id, 'initializeIPO', jsonb_build_object(
		'stakeAmount', p_stake_amount::TEXT
	));

	RETURN v_creator;
END;
$function$;
CREATE FUNCTION smx.liquidate_creator(p_creator uuid)
 RETURNS creators
 LANGUAGE plpgsql
 SET search_path TO 'smx', 'public'
AS $function$
DECLARE
	v_creator creators;
	v_locked NUMERIC;
	v_refund NUMERIC;
	v_refunds INTEGER;
	v_slashes INTEGER;
BEGIN
	SELECT * INTO v_creator FROM creators c WHERE c.id = p_creator FOR UPDATE;
	PERFORM assert_that(FOUND, 404, 'Creator not found');
	PERFORM assert_that(
		v_creator.status IN ('LIVE', 'GRACE'), 409, 'Creator cannot be liquidated'
	);

	SELECT coalesce(sum(t.amount), 0) INTO v_locked
	FROM tranches t WHERE t.creator_id = p_creator AND t.status = 'LOCKED';
	v_refund := trunc(v_locked * v_creator.raised_amount / v_creator.target_raise, 6);

	UPDATE tranches SET status = 'REFUNDED'
	WHERE creator_id = p_creator AND status = 'LOCKED';

	INSERT INTO payouts(creator_id, wallet, kind, amount)
	SELECT p_creator, s.wallet, 'REFUND', s.amount
	FROM pro_rata_split(p_creator, v_refund, 'INVESTED') s;
	GET DIAGNOSTICS v_refunds = ROW_COUNT;

	INSERT INTO payouts(creator_id, wallet, kind, amount)
	SELECT p_creator, s.wallet, 'SLASH', s.amount
	FROM pro_rata_split(p_creator, v_creator.stake_amount, 'HOLDINGS') s;
	GET DIAGNOSTICS v_slashes = ROW_COUNT;

	INSERT INTO blacklisted_nullifiers(nullifier, creator_id)
	VALUES (v_creator.world_id_nullifier, p_creator)
	ON CONFLICT (nullifier) DO NOTHING;

	UPDATE creators SET status = 'DEFAULTED' WHERE id = p_creator
	RETURNING * INTO v_creator;

	PERFORM emit_oracle_event(p_creator, 'DEFAULTED', jsonb_build_object(
		'refundTotal', (
			SELECT coalesce(sum(po.amount), 0)::TEXT FROM payouts po
			WHERE po.creator_id = p_creator AND po.kind = 'REFUND'
		),
		'slashTotal', (
			SELECT coalesce(sum(po.amount), 0)::TEXT FROM payouts po
			WHERE po.creator_id = p_creator AND po.kind = 'SLASH'
		),
		'refunds', v_refunds,
		'slashes', v_slashes
	));
	PERFORM enqueue_chain_job(p_creator, 'executeLiquidation', '{}');

	RETURN v_creator;
END;
$function$;
ALTER TABLE smx.creators ADD CONSTRAINT creators_arkiv_entity_key_check CHECK (length(arkiv_entity_key) <= 200);
ALTER TABLE smx.creators ADD CONSTRAINT creators_chain_id_check CHECK (chain_id > 0);
ALTER TABLE smx.creators ADD CONSTRAINT creators_check CHECK (raised_amount::numeric <= target_raise::numeric);
ALTER TABLE smx.creators ADD CONSTRAINT creators_display_name_check CHECK (length(display_name) >= 1 AND length(display_name) <= 80);
ALTER TABLE smx.creators ADD CONSTRAINT creators_headline_check CHECK (length(headline) <= 280);
ALTER TABLE smx.creators ADD CONSTRAINT creators_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES users(id);
ALTER TABLE smx.creators ADD CONSTRAINT creators_owner_user_id_key UNIQUE (owner_user_id);
ALTER TABLE smx.creators ADD CONSTRAINT creators_pkey PRIMARY KEY (id);
ALTER TABLE smx.blacklisted_nullifiers ADD CONSTRAINT blacklisted_nullifiers_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES creators(id);
ALTER TABLE smx.chain_jobs ADD CONSTRAINT chain_jobs_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES creators(id) ON DELETE CASCADE;
ALTER TABLE smx.creators ADD CONSTRAINT creators_share_bps_check CHECK (share_bps >= 1 AND share_bps <= 5000);
ALTER TABLE smx.creators ADD CONSTRAINT creators_stake_amount_check CHECK (stake_amount::numeric > 0::numeric);
ALTER TABLE smx.creators ADD CONSTRAINT creators_target_raise_check CHECK (target_raise::numeric > 0::numeric);
ALTER TABLE smx.creators ADD CONSTRAINT creators_term_months_check CHECK (term_months >= 1 AND term_months <= 120);
ALTER TABLE smx.creators ADD CONSTRAINT creators_terms_hash_check CHECK (length(terms_hash) <= 200);
ALTER TABLE smx.creators ADD CONSTRAINT creators_ticker_check CHECK (ticker ~ '^[A-Z]{3,6}$'::text);
ALTER TABLE smx.creators ADD CONSTRAINT creators_ticker_key UNIQUE (ticker);
ALTER TABLE smx.creators ADD CONSTRAINT creators_world_id_nullifier_check CHECK (world_id_nullifier ~ '^([0-9]{1,78}|0x[0-9a-fA-F]{1,64})$'::text);
ALTER TABLE smx.creators ADD CONSTRAINT creators_world_id_nullifier_key UNIQUE (world_id_nullifier);
CREATE INDEX creators_status_due_idx ON creators (status, next_proof_due_at);
CREATE TRIGGER creators_touch_updated_at BEFORE UPDATE ON creators FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TABLE smx.dividends (id uuid DEFAULT gen_random_uuid() NOT NULL, creator_id uuid NOT NULL, proof_id uuid NOT NULL, amount_due money_amount NOT NULL, status dividend_status DEFAULT 'DUE'::dividend_status NOT NULL, paid_tx_hash tx_hash, paid_at timestamp with time zone, stream_receipts jsonb, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE FUNCTION smx.dividend_json(d dividends)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'smx', 'public'
AS $function$
	SELECT jsonb_strip_nulls(jsonb_build_object(
		'id', d.id,
		'creatorId', d.creator_id,
		'ticker', (SELECT c.ticker FROM creators c WHERE c.id = d.creator_id),
		'proofId', d.proof_id,
		'period', (SELECT p.period FROM income_proofs p WHERE p.id = d.proof_id),
		'amountDue', d.amount_due::TEXT,
		'status', d.status,
		'paidTxHash', d.paid_tx_hash,
		'paidAt', d.paid_at,
		'createdAt', d.created_at
	))
$function$;
CREATE FUNCTION smx.pay_dividend(p_dividend uuid, p_tx_hash tx_hash DEFAULT NULL::text, p_user uuid DEFAULT NULL::uuid)
 RETURNS dividends
 LANGUAGE plpgsql
 SET search_path TO 'smx', 'public'
AS $function$
DECLARE
	v_div dividends;
	v_splits JSONB;
BEGIN
	SELECT * INTO v_div FROM dividends d WHERE d.id = p_dividend FOR UPDATE;
	PERFORM assert_that(FOUND, 404, 'Dividend not found');
	-- `p_user` is the caller; NULL means a system call (worker, seed).
	PERFORM assert_that(
		p_user IS NULL OR assert_creator_owner(v_div.creator_id, p_user),
		403, 'Only the creator can pay this dividend'
	);
	PERFORM assert_that(v_div.status = 'DUE', 409, 'Dividend was already paid');

	UPDATE dividends SET status = 'PAID', paid_tx_hash = p_tx_hash, paid_at = now()
	WHERE id = p_dividend
	RETURNING * INTO v_div;

	INSERT INTO payouts(creator_id, dividend_id, wallet, kind, amount)
	SELECT v_div.creator_id, p_dividend, s.wallet, 'DIVIDEND', s.amount
	FROM pro_rata_split(v_div.creator_id, v_div.amount_due, 'HOLDINGS') s;

	SELECT coalesce(jsonb_agg(
		jsonb_build_object('wallet', po.wallet::TEXT, 'amount', po.amount::TEXT)
		ORDER BY po.amount DESC, po.wallet
	), '[]')
	INTO v_splits
	FROM payouts po WHERE po.dividend_id = p_dividend;

	PERFORM emit_oracle_event(v_div.creator_id, 'DIVIDEND_PAID', jsonb_build_object(
		'dividendId', p_dividend,
		'amount', v_div.amount_due::TEXT,
		'splits', v_splits
	));
	PERFORM enqueue_chain_job(v_div.creator_id, 'distributeDividend', jsonb_build_object(
		'dividendId', p_dividend, 'amount', v_div.amount_due::TEXT
	));

	RETURN v_div;
END;
$function$;
ALTER TABLE smx.dividends ADD CONSTRAINT dividends_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES creators(id) ON DELETE CASCADE;
ALTER TABLE smx.dividends ADD CONSTRAINT dividends_pkey PRIMARY KEY (id);
ALTER TABLE smx.dividends ADD CONSTRAINT dividends_proof_id_key UNIQUE (proof_id);
CREATE INDEX dividends_creator_idx ON dividends (creator_id, created_at DESC);
CREATE TRIGGER dividends_touch_updated_at BEFORE UPDATE ON dividends FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TABLE smx.holdings (creator_id uuid NOT NULL, wallet evm_address NOT NULL, balance token_amount DEFAULT 0 NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE FUNCTION smx.holding_json(h holdings)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'smx', 'public'
AS $function$
	SELECT jsonb_strip_nulls(jsonb_build_object(
		'creatorId', h.creator_id,
		'ticker', (SELECT c.ticker FROM creators c WHERE c.id = h.creator_id),
		'wallet', h.wallet::TEXT,
		'balance', h.balance::TEXT,
		'sharePct', (
			SELECT round(h.balance / nullif(sum(x.balance), 0) * 100, 2)
			FROM holdings x WHERE x.creator_id = h.creator_id
		),
		'value', trunc(h.balance * coalesce(pool_price(h.creator_id), 0), 6)::TEXT
	))
$function$;
ALTER TABLE smx.holdings ADD CONSTRAINT holdings_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES creators(id) ON DELETE CASCADE;
ALTER TABLE smx.holdings ADD CONSTRAINT holdings_pkey PRIMARY KEY (creator_id, wallet);
CREATE TABLE smx.income_proofs (id uuid DEFAULT gen_random_uuid() NOT NULL, creator_id uuid NOT NULL, period integer NOT NULL, provider text NOT NULL, reclaim_proof_id text NOT NULL, verified_amount money_amount NOT NULL, status proof_status DEFAULT 'PENDING'::proof_status NOT NULL, audit jsonb, audit_log_ref text, raw jsonb, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE FUNCTION smx.audit_income_proof(p_proof uuid, p_verified_amount money_amount, p_audit jsonb DEFAULT '{}'::jsonb)
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
CREATE FUNCTION smx.audit_result_json(p income_proofs)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'smx', 'public'
AS $function$
	SELECT jsonb_strip_nulls(jsonb_build_object(
		'approved', p.status = 'APPROVED',
		'proof', income_proof_json(p),
		'dividend', (
			SELECT dividend_json(d) FROM dividends d WHERE d.proof_id = p.id
		)
	))
$function$;
CREATE FUNCTION smx.income_proof_json(p income_proofs)
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
		'createdAt', p.created_at
	))
$function$;
CREATE FUNCTION smx.submit_income_proof(p_creator uuid, p_provider text, p_reclaim_proof_id text, p_amount money_amount, p_raw jsonb DEFAULT NULL::jsonb, p_period integer DEFAULT NULL::integer)
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
		creator_id, period, provider, reclaim_proof_id, verified_amount, raw
	)
	VALUES (
		p_creator,
		coalesce(p_period, (
			SELECT count(*)::INTEGER FROM income_proofs ip
			WHERE ip.creator_id = p_creator AND ip.status = 'APPROVED'
		)),
		p_provider, p_reclaim_proof_id, p_amount, p_raw
	)
	RETURNING * INTO v_proof;
	RETURN v_proof;
END;
$function$;
ALTER TABLE smx.income_proofs ADD CONSTRAINT income_proofs_audit_log_ref_check CHECK (length(audit_log_ref) <= 500);
ALTER TABLE smx.income_proofs ADD CONSTRAINT income_proofs_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES creators(id) ON DELETE CASCADE;
ALTER TABLE smx.income_proofs ADD CONSTRAINT income_proofs_creator_id_reclaim_proof_id_key UNIQUE (creator_id, reclaim_proof_id);
ALTER TABLE smx.income_proofs ADD CONSTRAINT income_proofs_period_check CHECK (period >= 0);
ALTER TABLE smx.income_proofs ADD CONSTRAINT income_proofs_pkey PRIMARY KEY (id);
ALTER TABLE smx.dividends ADD CONSTRAINT dividends_proof_id_fkey FOREIGN KEY (proof_id) REFERENCES income_proofs(id);
ALTER TABLE smx.income_proofs ADD CONSTRAINT income_proofs_provider_check CHECK (length(provider) >= 1 AND length(provider) <= 200);
ALTER TABLE smx.income_proofs ADD CONSTRAINT income_proofs_reclaim_proof_id_check CHECK (length(reclaim_proof_id) >= 1 AND length(reclaim_proof_id) <= 500);
CREATE UNIQUE INDEX income_proofs_one_approved_per_period ON income_proofs (creator_id, period) WHERE status = 'APPROVED'::proof_status;
CREATE TRIGGER income_proofs_touch_updated_at BEFORE UPDATE ON income_proofs FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TABLE smx.investments (id uuid DEFAULT gen_random_uuid() NOT NULL, creator_id uuid NOT NULL, wallet evm_address NOT NULL, usdc_amount money_amount NOT NULL, token_amount token_amount NOT NULL, tx_hash tx_hash, created_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE FUNCTION smx.investment_json(i investments)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'smx', 'public'
AS $function$
	SELECT jsonb_strip_nulls(jsonb_build_object(
		'id', i.id,
		'creatorId', i.creator_id,
		'ticker', (SELECT c.ticker FROM creators c WHERE c.id = i.creator_id),
		'wallet', i.wallet::TEXT,
		'usdcAmount', i.usdc_amount::TEXT,
		'tokenAmount', i.token_amount::TEXT,
		'txHash', i.tx_hash,
		'createdAt', i.created_at,
		'holding', (
			SELECT holding_json(h) FROM holdings h
			WHERE h.creator_id = i.creator_id AND h.wallet = i.wallet
		)
	))
$function$;
CREATE FUNCTION smx.record_investment(p_creator uuid, p_wallet evm_address, p_usdc numeric)
 RETURNS investments
 LANGUAGE plpgsql
 SET search_path TO 'smx', 'public'
AS $function$
DECLARE
	v_creator creators;
	v_amount NUMERIC;
	v_inv investments;
BEGIN
	PERFORM assert_that(p_usdc > 0, 400, 'Amount must be positive');
	SELECT * INTO v_creator FROM creators c WHERE c.id = p_creator FOR UPDATE;
	PERFORM assert_that(FOUND, 404, 'Creator not found');
	PERFORM assert_that(
		v_creator.status = 'LIVE', 409, 'This raise is not open for investment'
	);
	v_amount := least(trunc(p_usdc, 6), v_creator.target_raise - v_creator.raised_amount);
	PERFORM assert_that(v_amount > 0, 409, 'This raise is fully subscribed');

	INSERT INTO investments(creator_id, wallet, usdc_amount, token_amount)
	VALUES (p_creator, p_wallet, v_amount, v_amount)
	RETURNING * INTO v_inv;

	INSERT INTO holdings(creator_id, wallet, balance)
	VALUES (p_creator, p_wallet, v_amount)
	ON CONFLICT (creator_id, wallet)
	DO UPDATE SET balance = holdings.balance + EXCLUDED.balance,
		updated_at = now();

	UPDATE creators SET raised_amount = raised_amount + v_amount
	WHERE id = p_creator;

	PERFORM emit_oracle_event(p_creator, 'INVESTED', jsonb_build_object(
		'wallet', p_wallet::TEXT,
		'usdcAmount', v_amount::TEXT,
		'tokenAmount', v_amount::TEXT
	));
	PERFORM enqueue_chain_job(p_creator, 'invest', jsonb_build_object(
		'investmentId', v_inv.id, 'wallet', p_wallet::TEXT, 'amount', v_amount::TEXT
	));

	RETURN v_inv;
END;
$function$;
ALTER TABLE smx.investments ADD CONSTRAINT investments_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES creators(id) ON DELETE CASCADE;
ALTER TABLE smx.investments ADD CONSTRAINT investments_pkey PRIMARY KEY (id);
ALTER TABLE smx.investments ADD CONSTRAINT investments_token_amount_check CHECK (token_amount::numeric > 0::numeric);
ALTER TABLE smx.investments ADD CONSTRAINT investments_usdc_amount_check CHECK (usdc_amount::numeric > 0::numeric);
CREATE INDEX investments_creator_idx ON investments (creator_id, created_at);
CREATE TABLE smx.oracle_events (id uuid DEFAULT gen_random_uuid() NOT NULL, creator_id uuid NOT NULL, kind oracle_event_kind NOT NULL, payload jsonb DEFAULT '{}'::jsonb NOT NULL, created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL);
CREATE FUNCTION smx.emit_oracle_event(p_creator uuid, p_kind oracle_event_kind, p_payload jsonb DEFAULT '{}'::jsonb)
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
	WHERE pool_price(p_creator) IS NOT NULL;

	RETURN v_event;
END;
$function$;
CREATE FUNCTION smx.oracle_event_json(e oracle_events)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'smx', 'public'
AS $function$
	SELECT jsonb_build_object(
		'id', e.id,
		'creatorId', e.creator_id,
		'ticker', e.payload ->> 'ticker',
		'kind', e.kind,
		'payload', e.payload,
		'createdAt', e.created_at
	)
$function$;
ALTER TABLE smx.oracle_events ADD CONSTRAINT oracle_events_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES creators(id) ON DELETE CASCADE;
ALTER TABLE smx.oracle_events ADD CONSTRAINT oracle_events_pkey PRIMARY KEY (id);
CREATE INDEX oracle_events_creator_idx ON oracle_events (creator_id, created_at DESC);
CREATE INDEX oracle_events_created_idx ON oracle_events (created_at DESC, id);
CREATE TRIGGER post_insert_event AFTER INSERT ON oracle_events REFERENCING NEW TABLE AS new FOR EACH STATEMENT EXECUTE FUNCTION pgmb.push_table_event();
CREATE TABLE smx.payouts (id uuid DEFAULT gen_random_uuid() NOT NULL, creator_id uuid NOT NULL, dividend_id uuid, wallet evm_address NOT NULL, kind payout_kind NOT NULL, amount money_amount NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE smx.payouts ADD CONSTRAINT payouts_amount_check CHECK (amount::numeric > 0::numeric);
ALTER TABLE smx.payouts ADD CONSTRAINT payouts_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES creators(id) ON DELETE CASCADE;
ALTER TABLE smx.payouts ADD CONSTRAINT payouts_dividend_id_fkey FOREIGN KEY (dividend_id) REFERENCES dividends(id);
ALTER TABLE smx.payouts ADD CONSTRAINT payouts_pkey PRIMARY KEY (id);
CREATE INDEX payouts_creator_idx ON payouts (creator_id, kind);
CREATE INDEX payouts_wallet_idx ON payouts (wallet);
CREATE TABLE smx.pools (creator_id uuid NOT NULL, usdc_reserve money_amount NOT NULL, token_reserve token_amount NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE smx.pools ADD CONSTRAINT pools_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES creators(id) ON DELETE CASCADE;
ALTER TABLE smx.pools ADD CONSTRAINT pools_pkey PRIMARY KEY (creator_id);
ALTER TABLE smx.pools ADD CONSTRAINT pools_token_reserve_check CHECK (token_reserve::numeric > 0::numeric);
ALTER TABLE smx.pools ADD CONSTRAINT pools_usdc_reserve_check CHECK (usdc_reserve::numeric > 0::numeric);
CREATE TABLE smx.price_ticks (id uuid DEFAULT gen_random_uuid() NOT NULL, creator_id uuid NOT NULL, at timestamp with time zone DEFAULT clock_timestamp() NOT NULL, price numeric(38,18) NOT NULL);
ALTER TABLE smx.price_ticks ADD CONSTRAINT price_ticks_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES creators(id) ON DELETE CASCADE;
ALTER TABLE smx.price_ticks ADD CONSTRAINT price_ticks_pkey PRIMARY KEY (id);
ALTER TABLE smx.price_ticks ADD CONSTRAINT price_ticks_price_check CHECK (price >= 0::numeric);
CREATE INDEX price_ticks_creator_at_idx ON price_ticks (creator_id, at DESC);
CREATE TABLE smx.trades (id uuid DEFAULT gen_random_uuid() NOT NULL, creator_id uuid NOT NULL, wallet evm_address NOT NULL, side trade_side NOT NULL, usdc_amount money_amount NOT NULL, token_amount token_amount NOT NULL, price numeric(38,18) NOT NULL, fee numeric(38,18) NOT NULL, tx_hash tx_hash, created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL);
CREATE FUNCTION smx.amm_swap(p_creator uuid, p_wallet evm_address, p_side trade_side, p_amount_in numeric, p_min_out numeric DEFAULT 0)
 RETURNS trades
 LANGUAGE plpgsql
 SET search_path TO 'smx', 'public'
AS $function$
DECLARE
	v_status creator_status;
	v_pool pools;
	v_fee NUMERIC;
	v_eff NUMERIC;
	v_out NUMERIC;
	v_usdc NUMERIC;
	v_tokens NUMERIC;
	v_trade trades;
BEGIN
	PERFORM assert_that(p_amount_in > 0, 400, 'Amount must be positive');
	SELECT c.status INTO v_status FROM creators c WHERE c.id = p_creator;
	PERFORM assert_that(FOUND, 404, 'Creator not found');
	PERFORM assert_that(
		v_status IN ('LIVE', 'GRACE'), 409,
		CASE WHEN v_status = 'DEFAULTED'
			THEN 'Trading is closed: this creator defaulted'
			ELSE 'Trading is not open for this creator' END
	);
	SELECT * INTO v_pool FROM pools p WHERE p.creator_id = p_creator FOR UPDATE;

	v_fee := p_amount_in * 0.003;
	v_eff := p_amount_in - v_fee;

	IF p_side = 'BUY' THEN
		v_out := trunc(v_pool.token_reserve * v_eff / (v_pool.usdc_reserve + v_eff), 18);
		v_usdc := trunc(p_amount_in, 6);
		v_tokens := v_out;
	ELSE
		PERFORM assert_that(
			coalesce((
				SELECT h.balance FROM holdings h
				WHERE h.creator_id = p_creator AND h.wallet = p_wallet
			), 0) >= p_amount_in,
			409, 'Insufficient token balance'
		);
		v_out := trunc(v_pool.usdc_reserve * v_eff / (v_pool.token_reserve + v_eff), 6);
		v_usdc := v_out;
		v_tokens := p_amount_in;
	END IF;

	PERFORM assert_that(v_out > 0, 400, 'Amount is too small to trade');
	PERFORM assert_that(
		v_out >= coalesce(p_min_out, 0), 409,
		'Slippage: price moved, output is below your minimum'
	);

	IF p_side = 'BUY' THEN
		UPDATE pools SET
			usdc_reserve = usdc_reserve + v_usdc,
			token_reserve = token_reserve - v_tokens,
			updated_at = now()
		WHERE creator_id = p_creator;
		INSERT INTO holdings(creator_id, wallet, balance)
		VALUES (p_creator, p_wallet, v_tokens)
		ON CONFLICT (creator_id, wallet)
		DO UPDATE SET balance = holdings.balance + EXCLUDED.balance,
			updated_at = now();
	ELSE
		UPDATE pools SET
			usdc_reserve = usdc_reserve - v_usdc,
			token_reserve = token_reserve + v_tokens,
			updated_at = now()
		WHERE creator_id = p_creator;
		UPDATE holdings SET balance = balance - v_tokens, updated_at = now()
		WHERE creator_id = p_creator AND wallet = p_wallet;
	END IF;

	INSERT INTO trades(creator_id, wallet, side, usdc_amount, token_amount, price, fee)
	VALUES (
		p_creator, p_wallet, p_side, v_usdc, v_tokens,
		trunc(v_usdc / v_tokens, 18), v_fee
	)
	RETURNING * INTO v_trade;

	PERFORM emit_oracle_event(p_creator, 'TRADE', jsonb_build_object(
		'side', p_side,
		'wallet', p_wallet::TEXT,
		'usdcAmount', v_usdc::TEXT,
		'tokenAmount', v_tokens::TEXT,
		'price', v_trade.price::TEXT
	));

	RETURN v_trade;
END;
$function$;
CREATE FUNCTION smx.trade_json(t trades)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'smx', 'public'
AS $function$
	SELECT jsonb_strip_nulls(jsonb_build_object(
		'id', t.id,
		'creatorId', t.creator_id,
		'ticker', (SELECT c.ticker FROM creators c WHERE c.id = t.creator_id),
		'wallet', t.wallet::TEXT,
		'side', t.side,
		'usdcAmount', t.usdc_amount::TEXT,
		'tokenAmount', t.token_amount::TEXT,
		'price', t.price::TEXT,
		'fee', t.fee::TEXT,
		'txHash', t.tx_hash,
		'createdAt', t.created_at
	))
$function$;
ALTER TABLE smx.trades ADD CONSTRAINT trades_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES creators(id) ON DELETE CASCADE;
ALTER TABLE smx.trades ADD CONSTRAINT trades_pkey PRIMARY KEY (id);
CREATE INDEX trades_creator_idx ON trades (creator_id, created_at DESC);
CREATE TABLE smx.tranches (id uuid DEFAULT gen_random_uuid() NOT NULL, creator_id uuid NOT NULL, idx integer NOT NULL, amount money_amount NOT NULL, status tranche_status DEFAULT 'LOCKED'::tranche_status NOT NULL, released_at timestamp with time zone, tx_hash tx_hash, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE FUNCTION smx.tranche_json(t tranches)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'smx', 'public'
AS $function$
	SELECT jsonb_strip_nulls(jsonb_build_object(
		'idx', t.idx,
		'amount', t.amount::TEXT,
		'status', t.status,
		'releasedAt', t.released_at,
		'txHash', t.tx_hash
	))
$function$;
ALTER TABLE smx.tranches ADD CONSTRAINT tranches_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES creators(id) ON DELETE CASCADE;
ALTER TABLE smx.tranches ADD CONSTRAINT tranches_creator_id_idx_key UNIQUE (creator_id, idx);
ALTER TABLE smx.tranches ADD CONSTRAINT tranches_idx_check CHECK (idx >= 0);
ALTER TABLE smx.tranches ADD CONSTRAINT tranches_pkey PRIMARY KEY (id);
CREATE TRIGGER tranches_touch_updated_at BEFORE UPDATE ON tranches FOR EACH ROW EXECUTE FUNCTION touch_updated_at();