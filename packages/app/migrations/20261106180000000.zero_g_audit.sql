CREATE OR REPLACE FUNCTION smx.income_proof_json(p smx.income_proofs)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'smx', 'public'
AS $function$
	SELECT jsonb_strip_nulls(jsonb_build_object(
		'id', p.id,
		'creatorId', p.creator_id,
		'ticker', (SELECT c.ticker FROM creators c WHERE c.id = p.creator_id),
		'period', p.period,
		'provider', p.provider,
		'reclaimProofId', p.reclaim_proof_id,
		'verifiedAmount', p.verified_amount::TEXT,
		'status', p.status,
		'reasoning', p.audit ->> 'reasoning',
		'rejectReason', p.audit ->> 'reason',
		'model', p.audit ->> 'model',
		'auditStatus', p.audit ->> 'status',
		'auditMessage', p.audit ->> 'message',
		'engine', p.audit ->> 'engine',
		'requestId', p.audit ->> 'requestId',
		'providerAddress', p.audit ->> 'providerAddress',
		'teeVerified', (p.audit ->> 'teeVerified')::BOOLEAN,
		'trustMode', p.audit ->> 'trustMode',
		'auditLogRef', p.audit_log_ref,
		'auditLogStorage', storage_status('AUDIT_LOG', p.id),
		'createdAt', p.created_at
	))
$function$;
CREATE FUNCTION smx.mark_audit_unavailable(p_proof uuid, p_message text)
 RETURNS smx.income_proofs
 LANGUAGE plpgsql
 SET search_path TO 'smx', 'public'
AS $function$
DECLARE
	v_proof income_proofs;
BEGIN
	UPDATE income_proofs SET audit = jsonb_build_object(
		'status', 'AUDIT_UNAVAILABLE', 'message', left(p_message, 300)
	)
	WHERE id = p_proof AND status = 'PENDING'
	RETURNING * INTO v_proof;
	PERFORM assert_that(FOUND, 409, 'Proof was already audited');
	RETURN v_proof;
END;
$function$;
CREATE OR REPLACE FUNCTION smx.submit_income_proof(p_creator uuid, p_provider text, p_reclaim_proof_id text, p_amount smx.money_amount, p_raw jsonb DEFAULT NULL::jsonb, p_period integer DEFAULT NULL::integer, p_reclaim_session_id text DEFAULT NULL::text)
 RETURNS smx.income_proofs
 LANGUAGE plpgsql
 SET search_path TO 'smx', 'public'
AS $function$
DECLARE
	v_status creator_status;
	v_proof income_proofs;
BEGIN
	SELECT c.status INTO v_status FROM creators c WHERE c.id = p_creator;
	PERFORM assert_that(FOUND, 404, 'Creator not found');
	PERFORM assert_that(
		v_status IN ('LIVE', 'GRACE'), 409, 'This creator is not accepting proofs'
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