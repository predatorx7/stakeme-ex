SET search_path TO smx, public;
SET check_function_bodies = off;

-- ─── onchain ingest (BEGIN) ───────────────────────────────────
-- Live chain mode: users sign swaps and investments, the server verifies the
-- receipt and these functions record the exact event amounts. The chain is the
-- truth; SQL is the index. Appended as one block; the migration
-- `onchain_ingest` ships exactly this.

-- Address of the creator's CreatorPool clone (factory `poolOf`). NULL for
-- creators launched before the AMM or in simulated chain mode.
ALTER TABLE creators ADD COLUMN IF NOT EXISTS pool_address evm_address;

-- One user transaction records one trade or one investment.
CREATE UNIQUE INDEX IF NOT EXISTS trades_tx_hash_uidx
	ON trades(tx_hash) WHERE tx_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS investments_tx_hash_uidx
	ON investments(tx_hash) WHERE tx_hash IS NOT NULL;

-- Stores the pool address a settled `createISA` job deployed.
CREATE OR REPLACE FUNCTION set_chain_job_pool(p_job UUID, p_pool evm_address)
RETURNS UUID
LANGUAGE sql
SET search_path = smx, public
AS $$
	UPDATE creators SET pool_address = p_pool
	WHERE id = (SELECT j.creator_id FROM chain_jobs j WHERE j.id = p_job)
	RETURNING id
$$;

-- Records a CreatorPool `Swap` event. Amounts are base units (USDC 6 dp,
-- token 18 dp) exactly as in the event, and so are the post-swap reserves,
-- which replace the pool row. BUY has `p_token_out > 0`, SELL `p_usdc_out > 0`.
-- Idempotent on the transaction hash: a replay returns the stored trade.
CREATE OR REPLACE FUNCTION ingest_onchain_swap(
	p_creator UUID,
	p_trader evm_address,
	p_tx_hash tx_hash,
	p_usdc_in NUMERIC,
	p_token_in NUMERIC,
	p_usdc_out NUMERIC,
	p_token_out NUMERIC,
	p_usdc_reserve NUMERIC,
	p_token_reserve NUMERIC
)
RETURNS trades
LANGUAGE plpgsql
SET search_path = smx, public
AS $$
DECLARE
	v_trade trades;
	v_buy BOOLEAN := p_token_out > 0;
	v_usdc NUMERIC := greatest(p_usdc_in, p_usdc_out) * 1e-6;
	v_tokens NUMERIC := greatest(p_token_in, p_token_out) * 1e-18;
BEGIN
	PERFORM assert_that(
		(v_buy AND p_usdc_in > 0 AND p_token_in = 0 AND p_usdc_out = 0)
			OR (NOT v_buy AND p_token_in > 0 AND p_usdc_out > 0 AND p_usdc_in = 0),
		400, 'Not a single swap'
	);
	PERFORM assert_that(
		p_usdc_reserve > 0 AND p_token_reserve > 0, 400, 'Pool reserves are empty'
	);
	-- Serializes ingests per creator, so a replay sees the first insert.
	PERFORM 1 FROM creators c WHERE c.id = p_creator FOR UPDATE;
	PERFORM assert_that(FOUND, 404, 'Creator not found');

	SELECT * INTO v_trade FROM trades t WHERE t.tx_hash = p_tx_hash;
	IF FOUND THEN
		PERFORM assert_that(
			v_trade.creator_id = p_creator AND v_trade.wallet = p_trader,
			409, 'Transaction already recorded for another trade'
		);
		RETURN v_trade;
	END IF;

	INSERT INTO pools(creator_id, usdc_reserve, token_reserve)
	VALUES (p_creator, p_usdc_reserve * 1e-6, p_token_reserve * 1e-18)
	ON CONFLICT (creator_id) DO UPDATE SET
		usdc_reserve = EXCLUDED.usdc_reserve,
		token_reserve = EXCLUDED.token_reserve,
		updated_at = now();

	IF v_buy THEN
		INSERT INTO holdings(creator_id, wallet, balance)
		VALUES (p_creator, p_trader, v_tokens)
		ON CONFLICT (creator_id, wallet)
		DO UPDATE SET balance = holdings.balance + EXCLUDED.balance,
			updated_at = now();
	ELSE
		-- The chain already enforced the balance; never go negative if an
		-- earlier transfer was not indexed.
		UPDATE holdings SET balance = greatest(balance - v_tokens, 0),
			updated_at = now()
		WHERE creator_id = p_creator AND wallet = p_trader;
	END IF;

	INSERT INTO trades(
		creator_id, wallet, side, usdc_amount, token_amount, price, fee, tx_hash
	)
	VALUES (
		p_creator, p_trader, CASE WHEN v_buy THEN 'BUY' ELSE 'SELL' END::trade_side,
		v_usdc, v_tokens, trunc(v_usdc / v_tokens, 18),
		CASE WHEN v_buy THEN v_usdc ELSE v_tokens END * 0.003, p_tx_hash
	)
	RETURNING * INTO v_trade;

	PERFORM emit_oracle_event(p_creator, 'TRADE', jsonb_build_object(
		'side', v_trade.side,
		'wallet', p_trader::TEXT,
		'usdcAmount', v_usdc::TEXT,
		'tokenAmount', v_tokens::TEXT,
		'price', v_trade.price::TEXT
	));
	RETURN v_trade;
END;
$$;

-- Records a LiquidISA `Invested` event (base units). `p_raise_closed` is true
-- when the same receipt holds `RaiseClosed`; the optional pool reserves come
-- from that receipt's pool `Seeded` event and replace the pool row before the
-- raise closes. Queues no chain job: the user already sent the transaction.
-- Idempotent on the transaction hash.
CREATE OR REPLACE FUNCTION ingest_onchain_invest(
	p_creator UUID,
	p_investor evm_address,
	p_tx_hash tx_hash,
	p_usdc NUMERIC,
	p_shares NUMERIC,
	p_raise_closed BOOLEAN DEFAULT FALSE,
	p_pool_usdc NUMERIC DEFAULT NULL,
	p_pool_tokens NUMERIC DEFAULT NULL
)
RETURNS investments
LANGUAGE plpgsql
SET search_path = smx, public
AS $$
DECLARE
	v_creator creators;
	v_inv investments;
	v_usdc NUMERIC := p_usdc * 1e-6;
	v_shares NUMERIC := p_shares * 1e-18;
BEGIN
	PERFORM assert_that(p_usdc > 0 AND p_shares > 0, 400, 'Amount must be positive');
	SELECT * INTO v_creator FROM creators c WHERE c.id = p_creator FOR UPDATE;
	PERFORM assert_that(FOUND, 404, 'Creator not found');

	SELECT * INTO v_inv FROM investments i WHERE i.tx_hash = p_tx_hash;
	IF FOUND THEN
		PERFORM assert_that(
			v_inv.creator_id = p_creator AND v_inv.wallet = p_investor,
			409, 'Transaction already recorded for another investment'
		);
		RETURN v_inv;
	END IF;

	INSERT INTO investments(creator_id, wallet, usdc_amount, token_amount, tx_hash)
	VALUES (p_creator, p_investor, v_usdc, v_shares, p_tx_hash)
	RETURNING * INTO v_inv;

	INSERT INTO holdings(creator_id, wallet, balance)
	VALUES (p_creator, p_investor, v_shares)
	ON CONFLICT (creator_id, wallet)
	DO UPDATE SET balance = holdings.balance + EXCLUDED.balance,
		updated_at = now();

	UPDATE creators SET raised_amount = least(raised_amount + v_usdc, target_raise)
	WHERE id = p_creator
	RETURNING * INTO v_creator;

	IF p_pool_usdc > 0 AND p_pool_tokens > 0 THEN
		UPDATE pools SET usdc_reserve = p_pool_usdc * 1e-6,
			token_reserve = p_pool_tokens * 1e-18, updated_at = now()
		WHERE creator_id = p_creator;
	END IF;

	PERFORM emit_oracle_event(p_creator, 'INVESTED', jsonb_build_object(
		'wallet', p_investor::TEXT,
		'usdcAmount', v_usdc::TEXT,
		'tokenAmount', v_shares::TEXT
	));
	IF p_raise_closed AND v_creator.raise_closed_at IS NULL THEN
		PERFORM finish_raise(p_creator);
	END IF;
	RETURN v_inv;
END;
$$;
-- ─── onchain ingest (END) ─────────────────────────────────────
