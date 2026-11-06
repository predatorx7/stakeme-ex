SET search_path TO smx, public;
SET check_function_bodies = off;

-- ─── demo mode (BEGIN) ────────────────────────────────────────
-- Helpers for the live demo (DEMO_MODE=1 routes only). `demo_state` holds the
-- epoch that scopes the onchain nullifier hash; a reset bumps it so the same
-- human can launch again against a factory that blocks reused nullifiers.
-- Appended as one block; the migration `demo_mode` ships exactly this.

CREATE TABLE demo_state(
	key   TEXT PRIMARY KEY,
	value TEXT NOT NULL
);

CREATE OR REPLACE FUNCTION demo_epoch()
RETURNS INTEGER
LANGUAGE sql STABLE
SET search_path = smx, public
AS $$
	SELECT coalesce((SELECT value::INTEGER FROM demo_state WHERE key = 'epoch'), 0)
$$;

-- Deletes the creator and every dependent row (all FKs cascade), the banned
-- nullifier entry, and bumps the epoch. Returns the new epoch.
CREATE OR REPLACE FUNCTION demo_reset_creator(p_ticker TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = smx, public
AS $$
DECLARE
	v_epoch INTEGER;
BEGIN
	DELETE FROM blacklisted_nullifiers b
	WHERE b.creator_id IN (SELECT c.id FROM creators c WHERE c.ticker = p_ticker);
	DELETE FROM creators c WHERE c.ticker = p_ticker;
	v_epoch := demo_epoch() + 1;
	INSERT INTO demo_state(key, value) VALUES ('epoch', v_epoch::TEXT)
	ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
	RETURN v_epoch;
END;
$$;

-- Invests the remaining raise as `p_wallet` (the oracle onchain; the `invest`
-- chain job mints, approves and invests). Filling closes the raise.
CREATE OR REPLACE FUNCTION demo_fill_raise(p_ticker TEXT, p_wallet evm_address)
RETURNS creators
LANGUAGE plpgsql
SET search_path = smx, public
AS $$
DECLARE
	v_creator creators;
BEGIN
	SELECT * INTO v_creator FROM creators c WHERE c.ticker = p_ticker;
	PERFORM assert_that(FOUND, 404, 'Creator not found');
	PERFORM assert_that(
		v_creator.status = 'LIVE' AND v_creator.raise_closed_at IS NULL
			AND v_creator.raised_amount < v_creator.target_raise,
		409, 'This raise is not open'
	);
	PERFORM record_investment(
		v_creator.id, p_wallet, v_creator.target_raise - v_creator.raised_amount
	);
	SELECT * INTO v_creator FROM creators c WHERE c.id = v_creator.id;
	RETURN v_creator;
END;
$$;

-- Puts the next proof deadline in the past (the sweep then freezes escrow).
CREATE OR REPLACE FUNCTION demo_advance_deadline(p_ticker TEXT)
RETURNS creators
LANGUAGE plpgsql
SET search_path = smx, public
AS $$
DECLARE
	v_creator creators;
BEGIN
	UPDATE creators c SET next_proof_due_at = now() - interval '1 hour'
	WHERE c.ticker = p_ticker AND c.status = 'LIVE'
		AND c.raise_closed_at IS NOT NULL
	RETURNING * INTO v_creator;
	PERFORM assert_that(FOUND, 409, 'No live creator with a closed raise');
	RETURN v_creator;
END;
$$;
-- ─── demo mode (END) ──────────────────────────────────────────

-- ─── proof chips (BEGIN) ──────────────────────────────────────
-- Exposes the World ID nullifier and the pool address in the creator document
-- so the UI can show "Verified on" proof. Appended as one block; the migration
-- `proof_chips` ships exactly this.

CREATE OR REPLACE FUNCTION creator_json(c creators)
RETURNS JSONB
LANGUAGE sql
SET search_path = smx, public
AS $$
	SELECT creator_summary_json(c) || jsonb_strip_nulls(jsonb_build_object(
		'ownerWallet', c.owner_wallet::TEXT,
		'termMonths', c.term_months,
		'stakeAmount', c.stake_amount::TEXT,
		'minIncome', c.min_income::TEXT,
		'termsRef', c.terms_ref,
		'termsStorage', storage_status('LISA_TERMS', c.id),
		'termsHash', c.terms_hash,
		'contractAddress', c.contract_address::TEXT,
		'poolAddress', c.pool_address::TEXT,
		'worldIdNullifier', c.world_id_nullifier,
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
$$;
-- ─── proof chips (END) ────────────────────────────────────────
