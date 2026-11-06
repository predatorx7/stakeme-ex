SET search_path TO smx, public;
SET check_function_bodies = off;

CREATE OR REPLACE FUNCTION smx.complete_storage_upload(p_id uuid, p_status storage_upload_status, p_ref text DEFAULT NULL::text, p_error text DEFAULT NULL::text, p_transient boolean DEFAULT false)
 RETURNS storage_uploads
 LANGUAGE plpgsql
 SET search_path TO 'smx', 'public'
AS $function$
DECLARE
	v_row storage_uploads;
	v_local TEXT;
BEGIN
	SELECT * INTO v_row FROM storage_uploads u
	WHERE u.id = p_id AND u.status = 'QUEUED' FOR UPDATE;
	IF NOT FOUND THEN
		SELECT * INTO v_row FROM storage_uploads u WHERE u.id = p_id;
		RETURN v_row;
	END IF;

	IF p_status = 'FAILED' AND p_transient AND v_row.attempts < 3 THEN
		UPDATE storage_uploads u SET
			error = left(p_error, 2000),
			next_attempt_at = now() + interval '30 seconds' * power(4, greatest(v_row.attempts - 1, 0))
		WHERE u.id = p_id
		RETURNING * INTO v_row;
		RETURN v_row;
	END IF;

	UPDATE storage_uploads u SET
		status = p_status,
		ref = CASE WHEN p_status = 'UPLOADED' THEN p_ref END,
		error = CASE WHEN p_status = 'FAILED' THEN left(p_error, 2000) END
	WHERE u.id = p_id
	RETURNING * INTO v_row;

	IF p_status = 'UPLOADED' THEN
		PERFORM assert_that(p_ref IS NOT NULL, 400, 'Upload has no ref');
		v_local := 'local:' || v_row.content_hash;
		IF v_row.kind = 'LISA_TERMS' THEN
			UPDATE creators c SET terms_ref = p_ref
			WHERE c.id = v_row.owner_id AND c.terms_ref = v_local;
		ELSE
			UPDATE income_proofs ip SET audit_log_ref = p_ref
			WHERE ip.id = v_row.owner_id AND ip.audit_log_ref = v_local;
		END IF;

		PERFORM emit_oracle_event(v_row.creator_id, 'STORAGE_CONFIRMED',
			jsonb_build_object(
				'kind', v_row.kind,
				'ref', p_ref,
				'contentHash', v_row.content_hash,
				'url', 'https://indexer-storage-testnet-turbo.0g.ai/file/info/' || p_ref
			));
	END IF;

	RETURN v_row;
END;
$function$;