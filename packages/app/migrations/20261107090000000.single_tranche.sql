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
	FROM pro_rata_split(p_creator, v_refund, 'HOLDINGS') s
	WHERE s.amount > 0;
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