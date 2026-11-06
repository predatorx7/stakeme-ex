SET search_path TO smx, public;
SET check_function_bodies = off;

CREATE FUNCTION smx.creator_candles_json(p_creator uuid, p_interval text, p_now timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'smx', 'public'
AS $function$
	WITH first_tick AS (
		SELECT min(t.at) AS at FROM price_ticks t
		WHERE t.creator_id = p_creator AND t.at <= p_now
	),
	cfg AS (
		SELECT
			CASE p_interval
				WHEN '1H' THEN interval '1 minute'
				WHEN '1D' THEN interval '1 hour'
				WHEN '1W' THEN interval '4 hours'
				ELSE make_interval(secs := greatest(60, ceil(
					extract(epoch FROM p_now - coalesce(f.at, p_now)) / 198 / 60
				) * 60)::DOUBLE PRECISION)
			END AS b,
			CASE p_interval WHEN '1H' THEN 60 WHEN '1D' THEN 24
				WHEN '1W' THEN 42 ELSE 200 END AS n,
			f.at AS first_at
		FROM first_tick f
		WHERE p_interval IN ('1H', '1D', '1W', 'ALL')
	),
	bounds AS (
		SELECT cfg.b,
			greatest(
				date_bin(cfg.b, cfg.first_at, TIMESTAMPTZ 'epoch'),
				date_bin(cfg.b, p_now, TIMESTAMPTZ 'epoch') - (cfg.n - 1) * cfg.b
			) AS start_at,
			date_bin(cfg.b, p_now, TIMESTAMPTZ 'epoch') AS end_at
		FROM cfg WHERE cfg.first_at IS NOT NULL
	),
	series AS (
		SELECT bo.b, g.bk
		FROM bounds bo, generate_series(bo.start_at, bo.end_at, bo.b) AS g(bk)
	),
	tk AS (
		SELECT date_bin(bo.b, t.at, TIMESTAMPTZ 'epoch') AS bk,
			(array_agg(t.price ORDER BY t.at, t.id))[1] AS o,
			(array_agg(t.price ORDER BY t.at DESC, t.id DESC))[1] AS c,
			max(t.price) AS h, min(t.price) AS l
		FROM bounds bo
		JOIN price_ticks t ON t.creator_id = p_creator
			AND t.at >= bo.start_at AND t.at <= p_now
		GROUP BY 1
	),
	vol AS (
		SELECT date_bin(bo.b, t.created_at, TIMESTAMPTZ 'epoch') AS bk,
			sum(t.usdc_amount) AS v
		FROM bounds bo
		JOIN trades t ON t.creator_id = p_creator
			AND t.created_at >= bo.start_at AND t.created_at <= p_now
		GROUP BY 1
	),
	pre AS (
		SELECT t.price FROM bounds bo
		JOIN price_ticks t ON t.creator_id = p_creator AND t.at < bo.start_at
		ORDER BY t.at DESC, t.id DESC LIMIT 1
	),
	-- Forward-fill the close: `grp` bumps at every bucket that has ticks.
	grouped AS (
		SELECT s.bk, tk.o, tk.h, tk.l, tk.c, coalesce(vol.v, 0) AS v,
			count(tk.c) OVER (ORDER BY s.bk) AS grp
		FROM series s
		LEFT JOIN tk ON tk.bk = s.bk
		LEFT JOIN vol ON vol.bk = s.bk
	),
	filled AS (
		SELECT g.*,
			coalesce(
				first_value(g.c) OVER (PARTITION BY g.grp ORDER BY g.bk),
				(SELECT price FROM pre)
			) AS close
		FROM grouped g
	),
	candles AS (
		SELECT f.bk, f.v, f.close,
			coalesce(lag(f.close) OVER (ORDER BY f.bk), f.o) AS open,
			f.h, f.l
		FROM filled f
	)
	SELECT jsonb_build_object('items', coalesce((
		SELECT jsonb_agg(jsonb_build_object(
			't', c.bk,
			'o', c.open::TEXT,
			'h', greatest(c.open, c.h, c.close)::TEXT,
			'l', least(c.open, c.l, c.close)::TEXT,
			'c', c.close::TEXT,
			'v', c.v::TEXT
		) ORDER BY c.bk)
		FROM candles c WHERE c.close IS NOT NULL
	), '[]'))
$function$;
CREATE FUNCTION smx.creator_market_json(p_creator uuid, p_wallet text DEFAULT NULL::text, p_now timestamp with time zone DEFAULT now())
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
						'DIVIDEND_PAID', 'ESCROW_FROZEN', 'ESCROW_UNFROZEN', 'DEFAULTED'
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
		-- "View all" flags: true when the full list holds more than shown here.
		'more', jsonb_build_object(
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
CREATE FUNCTION smx.pool_depth_json(p_usdc_reserve numeric, p_token_reserve numeric)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
AS $function$
	WITH spot AS (SELECT p_usdc_reserve / p_token_reserve AS price),
	sizes AS (SELECT s FROM unnest(ARRAY[100, 500, 1000, 5000]::NUMERIC[]) AS s),
	asks AS (
		SELECT s, smx.pool_tokens_for_usdc(p_usdc_reserve, p_token_reserve, s) AS tokens
		FROM sizes
	),
	bids AS (
		SELECT s, smx.pool_tokens_to_receive_usdc(p_usdc_reserve, p_token_reserve, s) AS tokens
		FROM sizes
	)
	SELECT jsonb_build_object(
		'bids', coalesce((
			SELECT jsonb_agg(jsonb_build_object(
				'sizeUsdc', b.s::TEXT,
				'tokens', b.tokens::TEXT,
				'avgPrice', trunc(b.s / b.tokens, 18)::TEXT,
				'impactPct', round((b.s / b.tokens - spot.price) / spot.price * 100, 2)::TEXT
			) ORDER BY b.s)
			FROM bids b, spot WHERE b.tokens > 0
		), '[]'),
		'asks', coalesce((
			SELECT jsonb_agg(jsonb_build_object(
				'sizeUsdc', a.s::TEXT,
				'tokens', a.tokens::TEXT,
				'avgPrice', trunc(a.s / a.tokens, 18)::TEXT,
				'impactPct', round((a.s / a.tokens - spot.price) / spot.price * 100, 2)::TEXT
			) ORDER BY a.s)
			FROM asks a, spot WHERE a.tokens > 0
		), '[]')
	)
$function$;
CREATE FUNCTION smx.pool_tokens_for_usdc(p_usdc_reserve numeric, p_token_reserve numeric, p_usdc numeric)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
AS $function$
	SELECT trunc(
		p_token_reserve * (p_usdc * 0.997)
		/ (p_usdc_reserve + p_usdc * 0.997),
		18
	)
$function$;
CREATE FUNCTION smx.pool_tokens_to_receive_usdc(p_usdc_reserve numeric, p_token_reserve numeric, p_usdc numeric)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
AS $function$
	SELECT CASE WHEN p_usdc > 0 AND p_usdc < p_usdc_reserve THEN
		-- out = R_u * e / (R_t + e) with e = 0.997 * tokens, so
		-- tokens = out * R_t / ((R_u - out) * 0.997).
		-- The scale-40 cast makes numeric division keep 40 decimals (its default
		-- precision is ~16 significant digits), so rounding up to 18 dp is exact
		-- and the swap never pays out below `p_usdc`. (Multiplying by 1e-18 keeps
		-- all 18 decimals; dividing would round to ~16 significant digits.)
		ceil(
			(p_usdc * p_token_reserve)::NUMERIC(100, 40)
			/ ((p_usdc_reserve - p_usdc) * 0.997)
			* 1000000000000000000
		) * 0.000000000000000001
	END
$function$;
CREATE FUNCTION smx.watchlist_add(p_user uuid, p_ticker text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'smx', 'public'
AS $function$
DECLARE
	v_creator UUID := creator_id_by_ticker(p_ticker);
	v_added TIMESTAMPTZ;
BEGIN
	SELECT w.created_at INTO v_added FROM watchlists w
	WHERE w.user_id = p_user AND w.creator_id = v_creator;
	IF v_added IS NULL THEN
		PERFORM assert_that(
			(SELECT count(*) FROM watchlists w WHERE w.user_id = p_user) < 100,
			409, 'Watchlist is full (100 creators)'
		);
		INSERT INTO watchlists(user_id, creator_id) VALUES (p_user, v_creator)
		RETURNING created_at INTO v_added;
	END IF;
	RETURN (
		SELECT watchlist_item_json(c, v_added) FROM creators c WHERE c.id = v_creator
	);
END;
$function$;
CREATE FUNCTION smx.watchlist_item_json(c creators, p_added timestamp with time zone)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'smx', 'public'
AS $function$
	SELECT creator_summary_json(c) || jsonb_build_object('addedAt', p_added)
$function$;
CREATE FUNCTION smx.watchlist_json(p_user uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'smx', 'public'
AS $function$
	SELECT jsonb_build_object('items', coalesce((
		SELECT jsonb_agg(
			watchlist_item_json(c, w.created_at) ORDER BY w.created_at DESC, c.id
		)
		FROM watchlists w
		JOIN creators c ON c.id = w.creator_id
		WHERE w.user_id = p_user
	), '[]'))
$function$;
CREATE FUNCTION smx.watchlist_remove(p_user uuid, p_ticker text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'smx', 'public'
AS $function$
DECLARE
	v_removed INTEGER;
BEGIN
	DELETE FROM watchlists w
	WHERE w.user_id = p_user AND w.creator_id = creator_id_by_ticker(p_ticker);
	GET DIAGNOSTICS v_removed = ROW_COUNT;
	RETURN v_removed > 0;
END;
$function$;
CREATE TABLE smx.watchlists (user_id uuid NOT NULL, creator_id uuid NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE smx.watchlists ADD CONSTRAINT watchlists_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES smx.creators(id) ON DELETE CASCADE;
ALTER TABLE smx.watchlists ADD CONSTRAINT watchlists_pkey PRIMARY KEY (user_id, creator_id);
ALTER TABLE smx.watchlists ADD CONSTRAINT watchlists_user_id_fkey FOREIGN KEY (user_id) REFERENCES smx.users(id) ON DELETE CASCADE;
CREATE INDEX watchlists_user_created_idx ON smx.watchlists (user_id, created_at DESC, creator_id);