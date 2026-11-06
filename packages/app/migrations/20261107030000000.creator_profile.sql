SET search_path TO smx, public;
SET check_function_bodies = off;

DROP FUNCTION smx.launch_ipo(p_owner uuid, p_wallet evm_address, p_ticker text, p_display_name text, p_headline text, p_share_bps integer, p_term_months integer, p_target_raise money_amount, p_stake_amount money_amount, p_nullifier text, p_terms_ref text, p_terms_hash text, p_chain_id integer, p_terms_document jsonb, p_tranche_bps integer[]);
CREATE DOMAIN smx.https_url AS text CHECK (((VALUE ~* '^https://[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:[0-9]{1,5})?(/[^\s<>"''`\\]*)?$'::text) AND (length(VALUE) <= 300)));
CREATE DOMAIN smx.social_github_url AS text CHECK (((VALUE ~* '^https://(www\.)?github\.com/[a-z0-9]([a-z0-9-]{0,38})(/[a-z0-9._-]{1,100})?/?$'::text) AND (length(VALUE) <= 200)));
CREATE DOMAIN smx.social_linkedin_url AS text CHECK (((VALUE ~* '^https://([a-z]{2,3}\.)?linkedin\.com/(in|company)/[a-z0-9_%-]{3,100}/?$'::text) AND (length(VALUE) <= 200)));
CREATE DOMAIN smx.social_website_url AS text CHECK (((VALUE ~* '^https://[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:[0-9]{1,5})?(/[^\s<>"''`\\]*)?$'::text) AND (length(VALUE) <= 300)));
CREATE DOMAIN smx.social_x_url AS text CHECK (((VALUE ~* '^https://(www\.)?(x|twitter)\.com/[a-z0-9_]{1,15}/?$'::text) AND (length(VALUE) <= 200)));
ALTER TYPE smx.oracle_event_kind ADD VALUE 'CREATOR_UPDATE' AFTER 'STORAGE_CONFIRMED';
CREATE TYPE smx.proof_cadence AS ENUM ('MONTHLY', 'QUARTERLY');
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
		'proofCadence', c.proof_cadence,
		'socialLinks', jsonb_build_object(
			'x', c.x_url, 'github', c.github_url,
			'linkedin', c.linkedin_url, 'website', c.website_url
		),
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
			c.status AS raw
		FROM c
	),
	supply AS (
		SELECT coalesce(sum(h.balance), 0) AS total,
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
				WHEN 'LIVE' THEN CASE WHEN st.raw = 'DRAFT' THEN 'Not yet listed' ELSE 'Live' END
				WHEN 'GRACE' THEN 'Grace period: proof overdue'
				WHEN 'FROZEN' THEN 'Escrow frozen: '
					|| coalesce((SELECT reason FROM frozen), 'proof overdue')
				WHEN 'DEFAULTED' THEN 'Defaulted: trading closed'
				ELSE 'Completed: term ended'
			END,
			'tradingHalted', st.raw NOT IN ('LIVE', 'GRACE')
		),
		'fundamentals', jsonb_build_object(
			'marketCap', trunc(px.price * supply.total, 6)::TEXT,
			'supply', supply.total::TEXT,
			'shareBps', c.share_bps,
			'termMonths', c.term_months,
			'termLeftMonths', CASE
				WHEN c.ipo_at IS NULL THEN c.term_months
				ELSE greatest(0, c.term_months - (
					extract(year FROM age(p_now, c.ipo_at)) * 12
					+ extract(month FROM age(p_now, c.ipo_at))
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
CREATE OR REPLACE FUNCTION smx.creator_page_json(p_ticker text, p_wallet text)
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
		'updates', (
			SELECT coalesce(jsonb_agg(creator_update_json(u) ORDER BY u.created_at DESC, u.id), '[]')
			FROM creator_updates u
			WHERE u.id IN (SELECT y.id FROM creator_updates y WHERE y.creator_id = c.id ORDER BY y.created_at DESC, y.id LIMIT 5)
		),
		-- "View all" flags: true when the full list holds more than shown here.
		'more', jsonb_build_object(
			'updates', (SELECT count(*) > 5 FROM (SELECT 1 FROM creator_updates y WHERE y.creator_id = c.id LIMIT 6) y),
			'holders', (SELECT count(*) > 20 FROM (SELECT 1 FROM holdings y WHERE y.creator_id = c.id AND y.balance > 0 LIMIT 21) y),
			'trades', (SELECT count(*) > 20 FROM (SELECT 1 FROM trades y WHERE y.creator_id = c.id LIMIT 21) y),
			'events', (SELECT count(*) > 20 FROM (SELECT 1 FROM oracle_events y WHERE y.creator_id = c.id LIMIT 21) y),
			'proofs', (SELECT count(*) > 10 FROM (SELECT 1 FROM income_proofs y WHERE y.creator_id = c.id LIMIT 11) y),
			'dividends', (SELECT count(*) > 10 FROM (SELECT 1 FROM dividends y WHERE y.creator_id = c.id LIMIT 11) y)
		),
		'viewer', jsonb_build_object(
			'wallet', p_wallet,
			'holding', (
				SELECT holding_json(h) FROM holdings h
				WHERE h.creator_id = c.id AND h.wallet = p_wallet::evm_address
			)
		)
	)) || jsonb_build_object('market', creator_market_json(c.id, p_wallet))
	FROM creators c WHERE c.ticker = p_ticker
$function$;
CREATE FUNCTION smx.creator_updates_page_json(p_ticker text, p_after_key text, p_after_id text, p_limit integer)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'smx', 'public'
AS $function$
	WITH cr AS (
		SELECT c.id, c.ticker, c.display_name, c.status FROM creators c
		WHERE c.id = creator_id_by_ticker(p_ticker)
	),
	page AS (
		SELECT x, x.created_at::TEXT AS k, x.id::TEXT AS i,
			row_number() OVER (ORDER BY x.created_at DESC, x.id DESC) AS n
		FROM creator_updates x
		WHERE x.creator_id = (SELECT id FROM cr)
			AND (
				p_after_key IS NULL
				OR (x.created_at, x.id)
					< (p_after_key::TIMESTAMPTZ, p_after_id::UUID)
			)
		ORDER BY x.created_at DESC, x.id DESC
		LIMIT least(greatest(p_limit, 1), 100) + 1
	)
	SELECT jsonb_build_object(
		'creator', (
			SELECT jsonb_build_object(
				'ticker', cr.ticker, 'displayName', cr.display_name,
				'status', cr.status
			) FROM cr
		),
		'items', coalesce((
			SELECT jsonb_agg(creator_update_json(p.x) ORDER BY p.n)
			FROM page p WHERE p.n <= least(greatest(p_limit, 1), 100)
		), '[]'),
		'next', (
			SELECT jsonb_build_object('key', p.k, 'id', p.i)
			FROM page p
			WHERE p.n = least(greatest(p_limit, 1), 100)
				AND EXISTS (SELECT 1 FROM page x WHERE x.n > p.n)
		)
	)
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
	WHERE pool_price(p_creator) IS NOT NULL
		AND p_kind NOT IN ('STORAGE_CONFIRMED', 'CREATOR_UPDATE');

	RETURN v_event;
END;
$function$;
CREATE FUNCTION smx.launch_ipo(p_owner uuid, p_wallet evm_address, p_ticker text, p_display_name text, p_headline text, p_share_bps integer, p_term_months integer, p_target_raise money_amount, p_stake_amount money_amount, p_nullifier text, p_terms_ref text, p_terms_hash text, p_chain_id integer DEFAULT NULL::integer, p_terms_document jsonb DEFAULT NULL::jsonb, p_tranche_bps integer[] DEFAULT ARRAY[2000, 4000, 4000], p_proof_cadence proof_cadence DEFAULT 'MONTHLY'::proof_cadence, p_social_links jsonb DEFAULT '{}'::jsonb)
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
CREATE FUNCTION smx.proof_cadence_interval(p_cadence proof_cadence)
 RETURNS interval
 LANGUAGE sql
 IMMUTABLE
AS $function$
	SELECT CASE p_cadence WHEN 'QUARTERLY' THEN interval '90 days'
		ELSE interval '30 days' END
$function$;
CREATE TABLE smx.creator_updates (id uuid DEFAULT gen_random_uuid() NOT NULL, creator_id uuid NOT NULL, body text NOT NULL, link https_url, created_by uuid, created_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE FUNCTION smx.creator_update_json(u creator_updates)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'smx', 'public'
AS $function$
	SELECT jsonb_strip_nulls(jsonb_build_object(
		'id', u.id,
		'body', u.body,
		'link', u.link,
		'createdAt', u.created_at
	))
$function$;
CREATE FUNCTION smx.post_creator_update(p_user uuid, p_ticker text, p_body text, p_link text DEFAULT NULL::text)
 RETURNS creator_updates
 LANGUAGE plpgsql
 SET search_path TO 'smx', 'public'
AS $function$
DECLARE
	v_creator creators;
	v_update creator_updates;
	v_body TEXT := btrim(coalesce(p_body, ''));
	v_link TEXT := nullif(btrim(coalesce(p_link, '')), '');
BEGIN
	SELECT * INTO v_creator FROM creators c
	WHERE c.id = creator_id_by_ticker(p_ticker) FOR UPDATE;
	PERFORM assert_that(
		v_creator.owner_user_id = p_user, 403,
		'Only the creator can post updates'
	);
	PERFORM assert_that(
		length(v_body) BETWEEN 1 AND 1000, 400,
		'An update needs 1 to 1,000 characters'
	);
	PERFORM assert_that(
		coalesce(pg_input_is_valid(v_link, 'smx.https_url'), TRUE), 400,
		'The link must be a full https:// address'
	);
	PERFORM assert_that(
		(
			SELECT count(*) FROM creator_updates u
			WHERE u.creator_id = v_creator.id
				AND u.created_at > now() - interval '24 hours'
		) < 5,
		429, 'You can post 5 updates a day. Try again tomorrow.'
	);

	INSERT INTO creator_updates(creator_id, body, link, created_by)
	VALUES (v_creator.id, v_body, v_link, p_user)
	RETURNING * INTO v_update;

	PERFORM emit_oracle_event(v_creator.id, 'CREATOR_UPDATE', jsonb_build_object(
		'updateId', v_update.id,
		'body', left(v_body, 140),
		'link', v_update.link
	));
	RETURN v_update;
END;
$function$;
ALTER TABLE smx.creator_updates ADD CONSTRAINT creator_updates_body_check CHECK (length(btrim(body)) >= 1 AND length(btrim(body)) <= 1000);
ALTER TABLE smx.creator_updates ADD CONSTRAINT creator_updates_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES smx.creators(id) ON DELETE CASCADE;
ALTER TABLE smx.creator_updates ADD CONSTRAINT creator_updates_pkey PRIMARY KEY (id);
CREATE INDEX creator_updates_creator_idx ON smx.creator_updates (creator_id, created_at DESC, id DESC);
ALTER TABLE smx.creators ADD COLUMN proof_cadence proof_cadence DEFAULT 'MONTHLY'::proof_cadence NOT NULL;
ALTER TABLE smx.creators ADD COLUMN x_url social_x_url;
ALTER TABLE smx.creators ADD COLUMN github_url social_github_url;
ALTER TABLE smx.creators ADD COLUMN linkedin_url social_linkedin_url;
ALTER TABLE smx.creators ADD COLUMN website_url social_website_url;