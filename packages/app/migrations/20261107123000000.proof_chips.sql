SET search_path TO smx, public;
SET check_function_bodies = off;
-- ─── proof chips (BEGIN) ──────────────────────────────────────
-- Exposes the World ID nullifier and the pool address in the creator document
-- so the UI can show "Verified on" proof. Appended as one block; the migration
-- `proof_chips` ships exactly this.

CREATE OR REPLACE FUNCTION smx.creator_json(c creators)
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
