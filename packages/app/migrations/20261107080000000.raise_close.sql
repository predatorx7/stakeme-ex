SET search_path TO smx, public;
SET check_function_bodies = off;

ALTER TABLE smx.creators ADD COLUMN raise_closed_at timestamp with time zone;
UPDATE smx.creators SET raise_closed_at = ipo_at WHERE ipo_at IS NOT NULL;
ALTER TABLE smx.chain_jobs DROP CONSTRAINT chain_jobs_fn_check;
ALTER TYPE smx.oracle_event_kind ADD VALUE 'STAKE_RETURNED' AFTER 'CREATOR_UPDATE';
CREATE OR REPLACE FUNCTION smx.amm_swap(p_creator uuid, p_wallet evm_address, p_side trade_side, p_amount_in numeric, p_min_out numeric DEFAULT 0)
 RETURNS trades
 LANGUAGE plpgsql
 SET search_path TO 'smx', 'public'
AS $function$
DECLARE
	v_status creator_status;
	v_closed TIMESTAMPTZ;
	v_pool pools;
	v_fee NUMERIC;
	v_eff NUMERIC;
	v_out NUMERIC;
	v_usdc NUMERIC;
	v_tokens NUMERIC;
	v_trade trades;
BEGIN
	PERFORM assert_that(p_amount_in > 0, 400, 'Amount must be positive');
	SELECT c.status, c.raise_closed_at INTO v_status, v_closed
	FROM creators c WHERE c.id = p_creator;
	PERFORM assert_that(FOUND, 404, 'Creator not found');
	PERFORM assert_that(
		v_status IN ('LIVE', 'GRACE', 'COMPLETED'), 409,
		CASE WHEN v_status = 'DEFAULTED'
			THEN 'Trading is closed: this creator defaulted'
			ELSE 'Trading is not open for this creator' END
	);
	PERFORM assert_that(
		v_closed IS NOT NULL, 409, 'Trading opens when the raise closes'
	);
	PERFORM assert_that(
		v_status = 'COMPLETED'
			OR (v_status <> 'GRACE' AND NOT escrow_frozen(p_creator)),
		409, 'Trading is halted: the escrow is frozen'
	);
	PERFORM assert_that(
		v_status <> 'COMPLETED' OR p_side = 'SELL', 409,
		'Term ended: only selling is allowed'
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
CREATE OR REPLACE FUNCTION smx.audit_income_proof(p_proof uuid, p_verified_amount money_amount, p_audit jsonb DEFAULT '{}'::jsonb, p_log_document jsonb DEFAULT NULL::jsonb)
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
		v_creator.status IN ('LIVE', 'GRACE') AND v_creator.raise_closed_at IS NOT NULL,
		409, 'This creator is not accepting proofs'
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
			THEN coalesce(nullif(btrim(p_audit ->> 'reasoning'), ''), 'Auditor rejected the proof')
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
		next_proof_due_at = greatest(next_proof_due_at, now())
			+ proof_cadence_interval(v_creator.proof_cadence),
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
CREATE FUNCTION smx.close_raise(p_creator uuid, p_user uuid DEFAULT NULL::uuid)
 RETURNS creators
 LANGUAGE plpgsql
 SET search_path TO 'smx', 'public'
AS $function$
DECLARE
	v_creator creators;
BEGIN
	SELECT * INTO v_creator FROM creators c WHERE c.id = p_creator FOR UPDATE;
	PERFORM assert_that(FOUND, 404, 'Creator not found');
	PERFORM assert_that(
		p_user IS NULL OR assert_creator_owner(p_creator, p_user),
		403, 'Only the creator can close the raise'
	);
	PERFORM assert_that(
		v_creator.status = 'LIVE' AND v_creator.raise_closed_at IS NULL,
		409, 'This raise is not open'
	);
	PERFORM assert_that(v_creator.raised_amount > 0, 409, 'Nothing has been raised yet');
	v_creator := finish_raise(p_creator);
	PERFORM enqueue_chain_job(p_creator, 'closeRaise', '{}');
	RETURN v_creator;
END;
$function$;
CREATE OR REPLACE FUNCTION smx.creator_hub_json(p_user uuid)
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
			'more', jsonb_build_object(
				'proofs', (SELECT count(*) > 10 FROM (SELECT 1 FROM income_proofs y WHERE y.creator_id = c.id LIMIT 11) y),
				'dividends', (SELECT count(*) > 10 FROM (SELECT 1 FROM dividends y WHERE y.creator_id = c.id LIMIT 11) y),
				'events', (SELECT count(*) > 0 FROM (SELECT 1 FROM oracle_events y WHERE y.creator_id = c.id LIMIT 1) y)
			),
			-- Posts left in the rolling 24-hour limit of `post_creator_update`.
			'holderCount', (
				SELECT count(*) FROM holdings h
				WHERE h.creator_id = c.id AND h.balance > 0
			)::INTEGER,
			'updatesLeft', greatest(0, 5 - (
				SELECT count(*) FROM creator_updates y
				WHERE y.creator_id = c.id AND y.created_at > now() - interval '24 hours'
			))::INTEGER,
			'collateral', jsonb_build_object(
				'stakeAmount', c.stake_amount::TEXT,
				'atRisk', c.status IN ('LIVE', 'GRACE')
			)
		))
		FROM creators c WHERE c.owner_user_id = p_user
	), '{}'::JSONB)
$function$;
CREATE OR REPLACE FUNCTION smx.creator_market_json(p_creator uuid, p_wallet text DEFAULT NULL::text, p_now timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'smx', 'public'
AS $function$
	WITH c AS (
		SELECT * FROM creators WHERE id = p_creator
	),
	pl AS (
		SELECT p.usdc_reserve, p.token_reserve FROM pools p
		WHERE p.creator_id = p_creator
	),
	px AS (
		SELECT coalesce((SELECT trunc(usdc_reserve / token_reserve, 18) FROM pl), 0) AS price
	),
	base AS (
		SELECT coalesce(
			(
				SELECT t.price FROM price_ticks t
				WHERE t.creator_id = p_creator AND t.at <= p_now - interval '24 hours'
				ORDER BY t.at DESC LIMIT 1
			),
			(
				SELECT t.price FROM price_ticks t
				WHERE t.creator_id = p_creator ORDER BY t.at ASC LIMIT 1
			),
			px.price
		) AS price
		FROM px
	),
	win AS (
		SELECT max(t.price) AS hi, min(t.price) AS lo FROM price_ticks t
		WHERE t.creator_id = p_creator
			AND t.at > p_now - interval '24 hours' AND t.at <= p_now
	),
	ohlc AS (
		SELECT
			base.price AS o,
			greatest(base.price, px.price, win.hi) AS h,
			least(base.price, px.price, win.lo) AS l,
			px.price AS c
		FROM base, px, win
	),
	ever AS (
		SELECT max(t.price) AS hi, min(t.price) AS lo FROM price_ticks t
		WHERE t.creator_id = p_creator AND t.at <= p_now
	),
	tr24 AS (
		SELECT
			coalesce(sum(t.usdc_amount), 0) AS usdc,
			coalesce(sum(t.token_amount), 0) AS tokens,
			count(*) AS n
		FROM trades t
		WHERE t.creator_id = p_creator
			AND t.created_at > p_now - interval '24 hours' AND t.created_at <= p_now
	),
	frozen AS (
		-- The newest freeze/unfreeze event decides.
		SELECT e.kind = 'ESCROW_FROZEN' AS is_frozen, e.payload ->> 'reason' AS reason
		FROM oracle_events e
		WHERE e.creator_id = p_creator
			AND e.kind IN ('ESCROW_FROZEN', 'ESCROW_UNFROZEN')
			AND e.created_at <= p_now
		ORDER BY e.created_at DESC, e.seq DESC LIMIT 1
	),
	st AS (
		SELECT
			CASE
				WHEN c.status = 'DEFAULTED' THEN 'DEFAULTED'
				WHEN c.status = 'COMPLETED' THEN 'COMPLETED'
				WHEN c.status = 'GRACE' THEN 'GRACE'
				WHEN coalesce((SELECT is_frozen FROM frozen), FALSE) THEN 'FROZEN'
				ELSE 'LIVE'
			END AS kind,
			c.status AS raw,
			c.raise_closed_at IS NULL AS raising
		FROM c
	),
	supply AS (
		-- Contract totalSupply: holders plus the pool's tokens.
		SELECT coalesce(sum(h.balance), 0) + coalesce((SELECT token_reserve FROM pl), 0) AS total,
			count(*) FILTER (WHERE h.balance > 0) AS holders
		FROM holdings h WHERE h.creator_id = p_creator
	),
	pos AS (
		-- cost = remaining tokens at the average cost. Multiplying before the
		-- division keeps it exact when nothing was sold.
		SELECT
			h.balance AS tokens,
			coalesce(b.usdc / nullif(b.tokens, 0), px.price) AS avg_cost,
			coalesce(h.balance * b.usdc / nullif(b.tokens, 0), h.balance * px.price)
				AS cost
		FROM holdings h
		CROSS JOIN px
		CROSS JOIN LATERAL (
			SELECT sum(x.usdc) AS usdc, sum(x.tokens) AS tokens FROM (
				SELECT i.usdc_amount AS usdc, i.token_amount AS tokens
				FROM investments i
				WHERE i.creator_id = p_creator AND i.wallet = p_wallet::evm_address
				UNION ALL
				SELECT t.usdc_amount, t.token_amount FROM trades t
				WHERE t.creator_id = p_creator AND t.wallet = p_wallet::evm_address
					AND t.side = 'BUY' AND t.created_at <= p_now
			) x
		) b
		WHERE h.creator_id = p_creator AND h.wallet = p_wallet::evm_address
			AND h.balance > 0
	)
	SELECT jsonb_build_object(
		'quote', jsonb_build_object(
			'price', px.price::TEXT,
			'change24h', (px.price - base.price)::TEXT,
			'changePct24h', coalesce(
				round((px.price - base.price) / nullif(base.price, 0) * 100, 2), 0
			)::TEXT
		),
		'ohlc24h', jsonb_build_object(
			'open', ohlc.o::TEXT, 'high', ohlc.h::TEXT,
			'low', ohlc.l::TEXT, 'close', ohlc.c::TEXT
		),
		'dayRange', jsonb_build_object('low', ohlc.l::TEXT, 'high', ohlc.h::TEXT),
		'sinceIpoRange', jsonb_build_object(
			'low', least(ever.lo, px.price)::TEXT,
			'high', greatest(ever.hi, px.price)::TEXT
		),
		'volume24h', tr24.usdc::TEXT,
		'vwap24h', trunc(tr24.usdc / nullif(tr24.tokens, 0), 18)::TEXT,
		'trades24h', tr24.n,
		'pool', jsonb_build_object(
			'usdcReserve', coalesce((SELECT usdc_reserve FROM pl), 0)::TEXT,
			'tokenReserve', coalesce((SELECT token_reserve FROM pl), 0)::TEXT,
			'feeBps', 30
		),
		'depth', coalesce(
			(SELECT pool_depth_json(pl.usdc_reserve, pl.token_reserve) FROM pl),
			'{"bids":[],"asks":[]}'
		),
		'status', jsonb_build_object(
			'kind', st.kind,
			'label', CASE st.kind
				WHEN 'LIVE' THEN CASE
					WHEN st.raw = 'DRAFT' THEN 'Not yet listed'
					WHEN st.raising THEN 'Raise open: trading starts when it closes'
					ELSE 'Live' END
				WHEN 'GRACE' THEN 'Grace period: proof overdue'
				WHEN 'FROZEN' THEN 'Escrow frozen: '
					|| coalesce((SELECT reason FROM frozen), 'proof overdue')
				WHEN 'DEFAULTED' THEN 'Defaulted: trading closed'
				ELSE 'Term ended: sell only'
			END,
			-- COMPLETED stays open for SELL only (amm_swap rejects BUY).
			'tradingHalted', st.raw <> 'COMPLETED' AND (
				st.raw <> 'LIVE' OR st.raising
				OR coalesce((SELECT is_frozen FROM frozen), FALSE)
			)
		),
		'fundamentals', jsonb_build_object(
			'marketCap', trunc(px.price * supply.total, 6)::TEXT,
			'supply', supply.total::TEXT,
			'shareBps', c.share_bps,
			'termMonths', c.term_months,
			'termLeftMonths', CASE
				WHEN c.raise_closed_at IS NULL THEN c.term_months
				ELSE greatest(0, c.term_months - (
					extract(year FROM age(p_now, c.raise_closed_at)) * 12
					+ extract(month FROM age(p_now, c.raise_closed_at))
				)::INTEGER)
			END,
			'verifiedIncomeTotal', (
				SELECT coalesce(sum(ip.verified_amount), 0)::TEXT FROM income_proofs ip
				WHERE ip.creator_id = p_creator AND ip.status = 'APPROVED'
			),
			'dividendsPaidTotal', (
				SELECT coalesce(sum(d.amount_due), 0)::TEXT FROM dividends d
				WHERE d.creator_id = p_creator AND d.status = 'PAID'
			),
			'nextProofDueAt', c.next_proof_due_at,
			'holders', supply.holders
		),
		'position', (
			SELECT jsonb_build_object(
				'tokens', pos.tokens::TEXT,
				'avgCost', pos.avg_cost::TEXT,
				'value', trunc(pos.tokens * px.price, 6)::TEXT,
				'pnl', trunc(pos.tokens * px.price - pos.cost, 6)::TEXT,
				'pnlPct', coalesce(
					round((pos.tokens * px.price - pos.cost) / nullif(pos.cost, 0) * 100, 2), 0
				)::TEXT
			)
			FROM pos
		),
		'corporateActions', coalesce((
			SELECT jsonb_agg(jsonb_build_object(
				'at', e.created_at,
				'kind', e.kind,
				'label', CASE e.kind
					WHEN 'IPO' THEN 'IPO launched'
					WHEN 'PROOF_VERIFIED' THEN 'Income proof verified (period '
						|| (e.payload ->> 'period') || ')'
					WHEN 'PROOF_REJECTED' THEN 'Income proof rejected'
						|| coalesce(': ' || (e.payload ->> 'reason'), '')
					WHEN 'TRANCHE_RELEASED' THEN 'Escrow tranche '
						|| (e.payload ->> 'idx') || ' released'
					WHEN 'DIVIDEND_PAID' THEN 'Dividend paid'
					WHEN 'ESCROW_FROZEN' THEN 'Escrow frozen'
						|| coalesce(': ' || (e.payload ->> 'reason'), '')
					WHEN 'ESCROW_UNFROZEN' THEN 'Escrow unfrozen'
					WHEN 'CREATOR_UPDATE' THEN 'Creator update: '
						|| (e.payload ->> 'body')
					ELSE 'Defaulted: holders refunded'
				END,
				'amount', CASE e.kind
					WHEN 'IPO' THEN e.payload ->> 'targetRaise'
					WHEN 'DEFAULTED' THEN e.payload ->> 'refundTotal'
					ELSE e.payload ->> 'amount'
				END
			) ORDER BY e.created_at DESC, e.seq DESC)
			FROM (
				SELECT x.* FROM oracle_events x
				WHERE x.creator_id = p_creator
					AND x.kind IN (
						'IPO', 'PROOF_VERIFIED', 'PROOF_REJECTED', 'TRANCHE_RELEASED',
						'DIVIDEND_PAID', 'ESCROW_FROZEN', 'ESCROW_UNFROZEN', 'DEFAULTED',
						'CREATOR_UPDATE'
					)
					AND x.created_at <= p_now
				ORDER BY x.created_at DESC, x.seq DESC LIMIT 50
			) e
		), '[]')
	)
	FROM c, px, base, ohlc, ever, tr24, st, supply
$function$;
CREATE OR REPLACE FUNCTION smx.dividend_json(d dividends)
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
		'settlementTxId', dividend_settlement_tx(d),
		'paidAt', d.paid_at,
		'createdAt', d.created_at
	))
$function$;
CREATE FUNCTION smx.dividend_settlement_tx(d dividends)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
	SELECT nullif(split_part(d.stream_receipts -> 'receipts' ->> 0, '#', 1), '')
$function$;
CREATE FUNCTION smx.escrow_frozen(p_creator uuid, p_now timestamp with time zone DEFAULT now())
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'smx', 'public'
AS $function$
	SELECT coalesce((
		SELECT e.kind = 'ESCROW_FROZEN' FROM oracle_events e
		WHERE e.creator_id = p_creator
			AND e.kind IN ('ESCROW_FROZEN', 'ESCROW_UNFROZEN')
			AND e.created_at <= p_now
		ORDER BY e.created_at DESC, e.seq DESC LIMIT 1
	), FALSE)
$function$;
CREATE FUNCTION smx.finish_raise(p_creator uuid)
 RETURNS creators
 LANGUAGE plpgsql
 SET search_path TO 'smx', 'public'
AS $function$
DECLARE
	v_creator creators;
	v_tranche tranches;
BEGIN
	UPDATE creators SET
		raise_closed_at = now(),
		next_proof_due_at = now() + proof_cadence_interval(proof_cadence)
	WHERE id = p_creator
	RETURNING * INTO v_creator;

	WITH sized AS (
		SELECT t.id, t.idx,
			trunc(t.amount * v_creator.raised_amount / v_creator.target_raise, 6) AS amt,
			t.idx = max(t.idx) OVER () AS is_last
		FROM tranches t WHERE t.creator_id = p_creator
	)
	UPDATE tranches t SET amount = CASE WHEN s.is_last
		THEN v_creator.raised_amount - coalesce((
			SELECT sum(o.amt) FROM sized o WHERE NOT o.is_last
		), 0)
		ELSE s.amt END
	FROM sized s WHERE t.id = s.id;

	UPDATE tranches SET status = 'RELEASED', released_at = now()
	WHERE creator_id = p_creator AND idx = 0
	RETURNING * INTO v_tranche;

	PERFORM emit_oracle_event(p_creator, 'TRANCHE_RELEASED', jsonb_build_object(
		'idx', v_tranche.idx, 'amount', v_tranche.amount::TEXT
	));
	RETURN v_creator;
END;
$function$;
CREATE OR REPLACE FUNCTION smx.launch_ipo(p_owner uuid, p_wallet evm_address, p_ticker text, p_display_name text, p_headline text, p_share_bps integer, p_term_months integer, p_target_raise money_amount, p_stake_amount money_amount, p_nullifier text, p_terms_ref text, p_terms_hash text, p_chain_id integer DEFAULT NULL::integer, p_terms_document jsonb DEFAULT NULL::jsonb, p_tranche_bps integer[] DEFAULT ARRAY[2000, 4000, 4000], p_proof_cadence proof_cadence DEFAULT 'MONTHLY'::proof_cadence, p_social_links jsonb DEFAULT '{}'::jsonb)
 RETURNS creators
 LANGUAGE plpgsql
 SET search_path TO 'smx', 'public'
AS $function$
DECLARE
	v_creator creators;
	v_seed NUMERIC;
	v_n INTEGER := cardinality(p_tranche_bps);
	v_links JSONB := coalesce(p_social_links, '{}');
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
		v_n BETWEEN 2 AND 5
			AND (SELECT sum(b) FROM unnest(p_tranche_bps) AS b) = 10000
			AND (SELECT min(b) FROM unnest(p_tranche_bps) AS b) > 0,
		400, 'Tranche schedule needs 2 to 5 tranches that sum to 10000 bps'
	);
	PERFORM assert_that(
		jsonb_typeof(v_links) = 'object' AND NOT EXISTS (
			SELECT 1 FROM jsonb_object_keys(v_links) AS k
			WHERE k NOT IN ('x', 'github', 'linkedin', 'website')
		),
		400, 'Social links can only be x, github, linkedin and website'
	);
	PERFORM assert_that(
		coalesce(pg_input_is_valid(nullif(btrim(v_links ->> 'x'), ''), 'smx.social_x_url'), TRUE),
		400, 'The X link must look like https://x.com/yourhandle'
	);
	PERFORM assert_that(
		coalesce(pg_input_is_valid(
			nullif(btrim(v_links ->> 'github'), ''), 'smx.social_github_url'
		), TRUE),
		400, 'The GitHub link must look like https://github.com/yourname'
	);
	PERFORM assert_that(
		coalesce(pg_input_is_valid(
			nullif(btrim(v_links ->> 'linkedin'), ''), 'smx.social_linkedin_url'
		), TRUE),
		400, 'The LinkedIn link must look like https://linkedin.com/in/yourname'
	);
	PERFORM assert_that(
		coalesce(pg_input_is_valid(
			nullif(btrim(v_links ->> 'website'), ''), 'smx.social_website_url'
		), TRUE),
		400, 'The website link must be a full https:// address'
	);

	INSERT INTO creators(
		owner_user_id, owner_wallet, ticker, display_name, headline, share_bps,
		term_months, target_raise, stake_amount, status, world_id_nullifier,
		terms_ref, terms_hash, chain_id, ipo_at, next_proof_due_at,
		proof_cadence, x_url, github_url, linkedin_url, website_url, created_by
	)
	VALUES (
		p_owner, p_wallet, p_ticker, p_display_name, coalesce(p_headline, ''),
		p_share_bps, p_term_months, p_target_raise, p_stake_amount, 'LIVE',
		p_nullifier, p_terms_ref, p_terms_hash, p_chain_id,
		now(), now() + proof_cadence_interval(p_proof_cadence), p_proof_cadence,
		nullif(btrim(v_links ->> 'x'), ''),
		nullif(btrim(v_links ->> 'github'), ''),
		nullif(btrim(v_links ->> 'linkedin'), ''),
		nullif(btrim(v_links ->> 'website'), ''), p_owner
	)
	RETURNING * INTO v_creator;

	-- The last tranche takes the rounding remainder so they sum to the target.
	INSERT INTO tranches(creator_id, idx, amount)
	SELECT
		v_creator.id,
		t.idx - 1,
		CASE WHEN t.idx = v_n
			THEN p_target_raise - coalesce(sum(trunc(p_target_raise * t.bps / 10000, 6))
				OVER (ORDER BY t.idx ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0)
			ELSE trunc(p_target_raise * t.bps / 10000, 6) END
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
CREATE OR REPLACE FUNCTION smx.liquidate_creator(p_creator uuid)
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
	v_refund := CASE WHEN v_creator.raise_closed_at IS NULL
		THEN trunc(v_locked * v_creator.raised_amount / v_creator.target_raise, 6)
		ELSE v_locked END;

	UPDATE tranches SET status = 'REFUNDED'
	WHERE creator_id = p_creator AND status = 'LOCKED';

	INSERT INTO payouts(creator_id, wallet, kind, amount)
	SELECT p_creator, s.wallet, 'REFUND', s.amount
	FROM pro_rata_split(p_creator, v_refund, 'HOLDINGS') s;
	GET DIAGNOSTICS v_refunds = ROW_COUNT;

	INSERT INTO payouts(creator_id, wallet, kind, amount)
	SELECT p_creator, s.wallet, 'SLASH', s.amount
	FROM pro_rata_split(p_creator, v_creator.stake_amount, 'HOLDINGS') s;
	GET DIAGNOSTICS v_slashes = ROW_COUNT;
	IF v_slashes = 0 THEN
		PERFORM emit_oracle_event(p_creator, 'STAKE_RETURNED', jsonb_build_object(
			'amount', v_creator.stake_amount::TEXT, 'reason', 'No holders to slash'
		));
	END IF;

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
CREATE OR REPLACE FUNCTION smx.pay_dividend(p_dividend uuid, p_tx_hash tx_hash DEFAULT NULL::text, p_user uuid DEFAULT NULL::uuid)
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
	) || CASE WHEN dividend_settlement_tx(v_div) IS NOT NULL
		THEN jsonb_build_object('txId', dividend_settlement_tx(v_div))
		ELSE '{}'::JSONB END);
	-- Paying the last overdue dividend inside the grace period cures a GRACE
	-- that the dividend caused (the proof deadline itself is still ahead).
	IF EXISTS (
		SELECT 1 FROM creators c
		WHERE c.id = v_div.creator_id AND c.status = 'GRACE'
			AND c.next_proof_due_at >= now()
	) AND NOT EXISTS (
		SELECT 1 FROM dividends d
		JOIN creators c ON c.id = d.creator_id
		WHERE d.creator_id = v_div.creator_id AND d.status = 'DUE'
			AND d.created_at + proof_cadence_interval(c.proof_cadence) < now()
	) THEN
		UPDATE creators SET status = 'LIVE', grace_until = NULL
		WHERE id = v_div.creator_id;
		PERFORM emit_oracle_event(v_div.creator_id, 'ESCROW_UNFROZEN', jsonb_build_object(
			'dividendId', p_dividend
		));
		PERFORM enqueue_chain_job(v_div.creator_id, 'unfreezeEscrow', '{}');
	END IF;
	PERFORM enqueue_chain_job(v_div.creator_id, 'distributeDividend', jsonb_build_object(
		'dividendId', p_dividend, 'amount', v_div.amount_due::TEXT
	));

	RETURN v_div;
END;
$function$;
CREATE OR REPLACE FUNCTION smx.record_investment(p_creator uuid, p_wallet evm_address, p_usdc numeric)
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
		v_creator.status = 'LIVE' AND v_creator.raise_closed_at IS NULL,
		409, 'This raise is not open for investment'
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
	WHERE id = p_creator
	RETURNING * INTO v_creator;

	PERFORM emit_oracle_event(p_creator, 'INVESTED', jsonb_build_object(
		'wallet', p_wallet::TEXT,
		'usdcAmount', v_amount::TEXT,
		'tokenAmount', v_amount::TEXT
	));
	PERFORM enqueue_chain_job(p_creator, 'invest', jsonb_build_object(
		'investmentId', v_inv.id, 'wallet', p_wallet::TEXT, 'amount', v_amount::TEXT
	));
	-- The contract closes the raise inside `invest` when it fills.
	IF v_creator.raised_amount = v_creator.target_raise THEN
		PERFORM finish_raise(p_creator);
	END IF;

	RETURN v_inv;
END;
$function$;
CREATE OR REPLACE FUNCTION smx.submit_income_proof(p_creator uuid, p_provider text, p_reclaim_proof_id text, p_amount money_amount, p_raw jsonb DEFAULT NULL::jsonb, p_period integer DEFAULT NULL::integer, p_reclaim_session_id text DEFAULT NULL::text)
 RETURNS income_proofs
 LANGUAGE plpgsql
 SET search_path TO 'smx', 'public'
AS $function$
DECLARE
	v_status creator_status;
	v_closed TIMESTAMPTZ;
	v_proof income_proofs;
BEGIN
	SELECT c.status, c.raise_closed_at INTO v_status, v_closed
	FROM creators c WHERE c.id = p_creator;
	PERFORM assert_that(FOUND, 404, 'Creator not found');
	PERFORM assert_that(
		v_status IN ('LIVE', 'GRACE') AND v_closed IS NOT NULL, 409,
		'This creator is not accepting proofs'
	);
	-- Retrying a proof whose 0G audit was unavailable returns the PENDING row.
	SELECT * INTO v_proof FROM income_proofs ip
	WHERE ip.creator_id = p_creator AND ip.reclaim_proof_id = p_reclaim_proof_id;
	IF FOUND THEN
		PERFORM assert_that(v_proof.status = 'PENDING', 409, 'This proof was already submitted');
		RETURN v_proof;
	END IF;

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
	v_reason TEXT;
BEGIN
	FOR r IN
		SELECT c.id, c.status, c.raise_closed_at, c.term_months,
			c.next_proof_due_at, c.grace_until, c.stake_amount,
			EXISTS (
				SELECT 1 FROM dividends d
				WHERE d.creator_id = c.id AND d.status = 'DUE'
					AND d.created_at + proof_cadence_interval(c.proof_cadence) < p_now
			) AS dividend_overdue
		FROM creators c
		WHERE c.status IN ('LIVE', 'GRACE') AND c.raise_closed_at IS NOT NULL
		ORDER BY c.id
		FOR UPDATE SKIP LOCKED
	LOOP
		IF r.status = 'GRACE' AND r.grace_until < p_now THEN
			PERFORM liquidate_creator(r.id);
			creator_id := r.id; transition := 'DEFAULTED'; RETURN NEXT;
		ELSIF r.status = 'LIVE'
			AND r.raise_closed_at + r.term_months * interval '30 days' < p_now THEN
			UPDATE creators SET status = 'COMPLETED' WHERE id = r.id;
			PERFORM emit_oracle_event(r.id, 'STAKE_RETURNED', jsonb_build_object(
				'amount', r.stake_amount::TEXT
			));
			PERFORM enqueue_chain_job(r.id, 'reclaimStake', jsonb_build_object(
				'amount', r.stake_amount::TEXT
			));
			creator_id := r.id; transition := 'COMPLETED'; RETURN NEXT;
		ELSIF r.status = 'LIVE'
			AND (r.next_proof_due_at < p_now OR r.dividend_overdue) THEN
			v_reason := CASE WHEN r.next_proof_due_at < p_now
				THEN 'Proof deadline missed' ELSE 'Dividend unpaid' END;
			UPDATE creators SET
				status = 'GRACE', grace_until = p_now + interval '14 days'
			WHERE id = r.id;
			PERFORM emit_oracle_event(r.id, 'GRACE_STARTED', jsonb_build_object(
				'graceUntil', p_now + interval '14 days', 'reason', v_reason
			));
			PERFORM freeze_escrow(r.id, v_reason);
			creator_id := r.id; transition := 'GRACE'; RETURN NEXT;
		END IF;
	END LOOP;
END;
$function$;
CREATE FUNCTION smx.token_supply_check(p_creator uuid)
 RETURNS TABLE(supply numeric, held numeric, pool_tokens numeric, ok boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'smx', 'public'
AS $function$
	SELECT
		c.raised_amount + greatest(trunc(c.target_raise / 10, 6), 100),
		coalesce((SELECT sum(h.balance) FROM holdings h WHERE h.creator_id = c.id), 0),
		p.token_reserve,
		c.raised_amount + greatest(trunc(c.target_raise / 10, 6), 100)
			= coalesce((SELECT sum(h.balance) FROM holdings h WHERE h.creator_id = c.id), 0)
				+ p.token_reserve
	FROM creators c JOIN pools p ON p.creator_id = c.id
	WHERE c.id = p_creator
$function$;
ALTER TABLE smx.chain_jobs ADD CONSTRAINT chain_jobs_fn_check CHECK (fn = ANY (ARRAY['createISA'::text, 'initializeIPO'::text, 'invest'::text, 'unlockNextTranche'::text, 'distributeDividend'::text, 'executeLiquidation'::text, 'freezeEscrow'::text, 'unfreezeEscrow'::text, 'closeRaise'::text, 'reclaimStake'::text]));
