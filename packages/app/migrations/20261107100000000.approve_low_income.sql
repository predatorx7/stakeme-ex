SET search_path TO smx, public;
SET check_function_bodies = off;

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
	v_below_min BOOLEAN;
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

	IF p_verified_amount > 0 THEN
		INSERT INTO dividends(creator_id, proof_id, amount_due)
		VALUES (
			v_creator.id, p_proof,
			round(p_verified_amount * v_creator.share_bps / 10000, 6)
		)
		RETURNING * INTO v_dividend;
	END IF;

	-- Release the earliest locked tranche, if any remain, but only for income
	-- at or above the minimum.
	v_below_min := p_verified_amount < v_creator.min_income;
	IF NOT v_below_min THEN
		UPDATE tranches SET status = 'RELEASED', released_at = now()
		WHERE id = (
			SELECT t.id FROM tranches t
			WHERE t.creator_id = v_creator.id AND t.status = 'LOCKED'
			ORDER BY t.idx LIMIT 1 FOR UPDATE
		)
		RETURNING * INTO v_tranche;
	END IF;

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
		'dividendDue', coalesce(v_dividend.amount_due, 0)::TEXT,
		'model', p_audit ->> 'model',
		'reasoning', p_audit ->> 'reasoning'
	) || CASE WHEN v_below_min THEN jsonb_build_object(
		'trancheLocked', TRUE,
		'note', 'Income below the ' || v_creator.min_income::TEXT
			|| ' minimum: next tranche stays locked'
	) ELSE '{}'::JSONB END);

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
		v_n BETWEEN 1 AND 5
			AND (SELECT sum(b) FROM unnest(p_tranche_bps) AS b) = 10000
			AND (SELECT min(b) FROM unnest(p_tranche_bps) AS b) > 0,
		400, 'Tranche schedule needs 1 to 5 tranches that sum to 10000 bps'
	);
	PERFORM assert_that(
		p_stake_amount >= p_target_raise * 0.05,
		400, 'Stake must be at least 5% of the raise ($'
			|| trim_scale(round(p_target_raise * 0.05, 2))::TEXT
			|| ' for a $' || trim_scale(p_target_raise)::TEXT || ' raise)'
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