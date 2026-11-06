SET search_path TO smx, public;
SET check_function_bodies = off;

-- ─── portfolio (BEGIN) ────────────────────────────────────────
-- Read-only functions behind GET /portfolio. Appended as one block; the
-- migration `portfolio` ships exactly these.

-- A wallet's portfolio. Position math is NOT repeated here: each holding's
-- tokens, average cost, value and P&L come from `creator_market_json(...)
-- -> position`, so this page and the token page always agree. Cost is the
-- position value minus its P&L. Totals sum the rows. Dividends are the
-- wallet's DIVIDEND payouts (latest 25 plus the lifetime total). `creator` is
-- the user's own IPO, if any.
CREATE OR REPLACE FUNCTION smx.wallet_portfolio_json(p_wallet TEXT, p_user UUID)
RETURNS JSONB
LANGUAGE sql STABLE
SET search_path = smx, public
AS $$
	WITH h AS (
		SELECT c.id, c.ticker, c.display_name, creator_market_json(c.id, p_wallet) AS m
		FROM holdings hd
		JOIN creators c ON c.id = hd.creator_id
		WHERE hd.wallet = p_wallet::evm_address AND hd.balance > 0
	),
	pos AS (
		SELECT h.id, h.ticker, h.display_name,
			(h.m -> 'position' ->> 'tokens')::NUMERIC AS tokens,
			(h.m -> 'position' ->> 'avgCost')::NUMERIC AS avg_cost,
			(h.m -> 'quote' ->> 'price')::NUMERIC AS price,
			(h.m -> 'position' ->> 'value')::NUMERIC AS value,
			(h.m -> 'position' ->> 'pnl')::NUMERIC AS pnl,
			(h.m -> 'position' ->> 'pnlPct')::NUMERIC AS pnl_pct,
			h.m -> 'status' ->> 'kind' AS status_kind,
			h.m -> 'status' ->> 'label' AS status_label
		FROM h
		WHERE h.m -> 'position' IS NOT NULL AND h.m -> 'position' <> 'null'::JSONB
	),
	tot AS (
		SELECT coalesce(sum(value - pnl), 0) AS invested,
			coalesce(sum(value), 0) AS value,
			coalesce(sum(pnl), 0) AS pnl
		FROM pos
	),
	dv AS (
		SELECT po.id, po.amount, po.created_at, d.id AS dividend_id,
			d.paid_tx_hash, c.id AS creator_id, c.ticker, c.display_name
		FROM payouts po
		JOIN dividends d ON d.id = po.dividend_id
		JOIN creators c ON c.id = po.creator_id
		WHERE po.wallet = p_wallet::evm_address AND po.kind = 'DIVIDEND'
	)
	SELECT jsonb_build_object(
		'wallet', p_wallet,
		'totals', (
			SELECT jsonb_build_object(
				'invested', tot.invested::TEXT,
				'value', tot.value::TEXT,
				'pnl', tot.pnl::TEXT,
				'pnlPct', coalesce(
					round(tot.pnl / nullif(tot.invested, 0) * 100, 2), 0
				)::TEXT
			) FROM tot
		),
		'holdings', coalesce((
			SELECT jsonb_agg(jsonb_build_object(
				'creatorId', p.id,
				'ticker', p.ticker,
				'displayName', p.display_name,
				'tokens', p.tokens::TEXT,
				'avgCost', p.avg_cost::TEXT,
				'price', p.price::TEXT,
				'value', p.value::TEXT,
				'pnl', p.pnl::TEXT,
				'pnlPct', p.pnl_pct::TEXT,
				'status', p.status_kind,
				'statusLabel', p.status_label
			) ORDER BY p.value DESC, p.ticker)
			FROM pos p
		), '[]'),
		'dividends', jsonb_build_object(
			'total', (SELECT coalesce(sum(amount), 0) FROM dv)::TEXT,
			'count', (SELECT count(*) FROM dv),
			'items', coalesce((
				SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
					'id', x.id,
					'dividendId', x.dividend_id,
					'creatorId', x.creator_id,
					'ticker', x.ticker,
					'displayName', x.display_name,
					'amount', x.amount::TEXT,
					'txHash', x.paid_tx_hash,
					'createdAt', x.created_at
				)) ORDER BY x.created_at DESC, x.id DESC)
				FROM (
					SELECT * FROM dv ORDER BY created_at DESC, id DESC LIMIT 25
				) x
			), '[]')
		),
		'creator', (
			SELECT jsonb_build_object(
				'ticker', c.ticker, 'displayName', c.display_name, 'status', c.status
			)
			FROM creators c WHERE c.owner_user_id = p_user
		)
	)
$$;

-- GET /portfolio transactions: a wallet's primary investments and AMM trades,
-- newest first, keyset on (created_at, id). `type` is INVESTMENT, BUY or SELL.
-- Investments price at USDC / tokens (1.0 at the IPO).
CREATE OR REPLACE FUNCTION smx.wallet_transactions_json(
	p_wallet TEXT, p_after_key TEXT, p_after_id TEXT, p_limit INTEGER
)
RETURNS JSONB
LANGUAGE sql STABLE
SET search_path = smx, public
AS $$
	WITH tx AS (
		SELECT i.id, i.creator_id, 'INVESTMENT' AS type, i.usdc_amount,
			i.token_amount, trunc(i.usdc_amount / nullif(i.token_amount, 0), 18) AS price,
			i.tx_hash::TEXT AS tx_hash, i.created_at
		FROM investments i WHERE i.wallet = p_wallet::evm_address
		UNION ALL
		SELECT t.id, t.creator_id, t.side::TEXT, t.usdc_amount, t.token_amount,
			t.price, t.tx_hash::TEXT, t.created_at
		FROM trades t WHERE t.wallet = p_wallet::evm_address
	),
	page AS (
		SELECT tx.*, c.ticker, c.display_name,
			tx.created_at::TEXT AS k, tx.id::TEXT AS i,
			row_number() OVER (ORDER BY tx.created_at DESC, tx.id DESC) AS n
		FROM tx
		JOIN creators c ON c.id = tx.creator_id
		WHERE p_after_key IS NULL
			OR (tx.created_at, tx.id)
				< (p_after_key::TIMESTAMPTZ, p_after_id::UUID)
		ORDER BY tx.created_at DESC, tx.id DESC
		LIMIT least(greatest(p_limit, 1), 100) + 1
	)
	SELECT jsonb_build_object(
		'items', coalesce((
			SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
				'id', p.id,
				'type', p.type,
				'creatorId', p.creator_id,
				'ticker', p.ticker,
				'displayName', p.display_name,
				'tokenAmount', p.token_amount::TEXT,
				'usdcAmount', p.usdc_amount::TEXT,
				'price', p.price::TEXT,
				'txHash', p.tx_hash,
				'createdAt', p.created_at
			)) ORDER BY p.n)
			FROM page p WHERE p.n <= least(greatest(p_limit, 1), 100)
		), '[]'),
		'next', (
			SELECT jsonb_build_object('key', p.k, 'id', p.i)
			FROM page p
			WHERE p.n = least(greatest(p_limit, 1), 100)
				AND EXISTS (SELECT 1 FROM page x WHERE x.n > p.n)
		)
	)
$$;
-- ─── portfolio (END) ──────────────────────────────────────────
