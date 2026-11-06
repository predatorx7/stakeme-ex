SET search_path TO smx, public;
SET check_function_bodies = off;

-- ─── dividend claims (BEGIN) ──────────────────────────────────
-- Onchain creators pay dividends in USDC through `LiquidISA.distributeDividend`
-- (signed by the creator); holders pull them with `claim()`. These objects
-- record the creator's payment without the HBAR split, and each verified claim.
-- Appended as one block; the migration `dividend_claims` ships exactly this.

-- One row per verified `Claimed` transaction. Amounts are USDC.
CREATE TABLE dividend_claims(
	id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	creator_id UUID NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
	wallet     evm_address NOT NULL,
	tx_hash    tx_hash NOT NULL UNIQUE,
	amount     money_amount NOT NULL CHECK (amount > 0),
	created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX dividend_claims_wallet_idx
	ON dividend_claims(wallet, created_at DESC, id DESC);

-- Marks a due dividend paid by the creator's own `distributeDividend` call.
-- Same checks as `pay_dividend` (owner, DUE), then: the hash must be new, the
-- queued oracle `distributeDividend` job is settled by that hash (the oracle
-- must not pay it a second time), and the per-holder HBAR payouts are dropped
-- because holders now claim USDC onchain. `stream_receipts` is set so the HBAR
-- stream worker skips it; `p_holders` is the holder count for the UI.
CREATE OR REPLACE FUNCTION pay_dividend_onchain(
	p_dividend UUID, p_tx_hash tx_hash, p_holders INTEGER, p_user UUID
)
RETURNS dividends
LANGUAGE plpgsql
SET search_path = smx, public
AS $$
DECLARE
	v_div dividends;
BEGIN
	PERFORM assert_that(
		NOT EXISTS (
			SELECT 1 FROM dividends d
			WHERE d.paid_tx_hash = p_tx_hash AND d.id <> p_dividend
		),
		409, 'This transaction already paid another dividend'
	);
	v_div := pay_dividend(p_dividend, p_tx_hash, p_user);
	UPDATE chain_jobs SET status = 'CONFIRMED', tx_hash = p_tx_hash
	WHERE fn = 'distributeDividend' AND status IN ('QUEUED', 'SENT')
		AND args ->> 'dividendId' = p_dividend::TEXT;
	DELETE FROM payouts WHERE dividend_id = p_dividend AND kind = 'DIVIDEND';
	UPDATE dividends SET stream_receipts = jsonb_build_object(
		'status', 'ONCHAIN',
		'receipts', jsonb_build_array(p_tx_hash),
		'holders', p_holders
	)
	WHERE id = p_dividend
	RETURNING * INTO v_div;
	RETURN v_div;
END;
$$;

-- Records a verified `Claimed` event (`p_amount` in USDC base units).
-- Idempotent on the transaction hash: a replay returns the stored claim, but
-- the same hash for another wallet or creator is refused.
CREATE OR REPLACE FUNCTION ingest_dividend_claim(
	p_creator UUID, p_wallet evm_address, p_tx_hash tx_hash, p_amount NUMERIC
)
RETURNS dividend_claims
LANGUAGE plpgsql
SET search_path = smx, public
AS $$
DECLARE
	v_claim dividend_claims;
BEGIN
	INSERT INTO dividend_claims(creator_id, wallet, tx_hash, amount)
	VALUES (p_creator, p_wallet, p_tx_hash, p_amount / 1e6)
	ON CONFLICT (tx_hash) DO NOTHING
	RETURNING * INTO v_claim;
	IF v_claim.id IS NULL THEN
		SELECT * INTO v_claim FROM dividend_claims WHERE tx_hash = p_tx_hash;
		PERFORM assert_that(
			v_claim.creator_id = p_creator AND v_claim.wallet = p_wallet,
			409, 'This transaction was recorded for another claim'
		);
	END IF;
	RETURN v_claim;
END;
$$;

-- `wallet_portfolio_json` plus the wallet's verified claims: they join the
-- "dividends received" total, count and latest 25 items (no `dividendId`).
-- Dividends paid onchain have no payout rows, so nothing counts twice.
CREATE OR REPLACE FUNCTION wallet_portfolio_with_claims_json(
	p_wallet TEXT, p_user UUID
)
RETURNS JSONB
LANGUAGE sql STABLE
SET search_path = smx, public
AS $$
	WITH base AS (
		SELECT wallet_portfolio_json(p_wallet, p_user) AS j
	),
	cl AS (
		SELECT dc.id, dc.amount, dc.tx_hash, dc.created_at,
			c.id AS creator_id, c.ticker, c.display_name
		FROM dividend_claims dc
		JOIN creators c ON c.id = dc.creator_id
		WHERE dc.wallet = p_wallet::evm_address
	),
	merged AS (
		SELECT x.item, x.at, x.id FROM (
			SELECT i.item, (i.item ->> 'createdAt')::TIMESTAMPTZ AS at,
				i.item ->> 'id' AS id
			FROM base, jsonb_array_elements(base.j -> 'dividends' -> 'items') i(item)
			UNION ALL
			SELECT jsonb_strip_nulls(jsonb_build_object(
				'id', cl.id,
				'creatorId', cl.creator_id,
				'ticker', cl.ticker,
				'displayName', cl.display_name,
				'amount', cl.amount::TEXT,
				'txHash', cl.tx_hash,
				'createdAt', cl.created_at
			)), cl.created_at, cl.id::TEXT
			FROM cl
		) x
		ORDER BY x.at DESC, x.id DESC
		LIMIT 25
	)
	SELECT jsonb_set(base.j, '{dividends}', jsonb_build_object(
		'total', ((base.j -> 'dividends' ->> 'total')::NUMERIC
			+ (SELECT coalesce(sum(amount), 0) FROM cl))::TEXT,
		'count', (base.j -> 'dividends' ->> 'count')::INTEGER
			+ (SELECT count(*) FROM cl),
		'items', coalesce((SELECT jsonb_agg(item ORDER BY at DESC, id DESC) FROM merged), '[]')
	))
	FROM base
$$;
-- ─── dividend claims (END) ────────────────────────────────────
