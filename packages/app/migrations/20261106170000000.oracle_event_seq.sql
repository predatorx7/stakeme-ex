-- Planned by `npm run migrate:plan`, then edited by hand: the SET lines and the
-- column and index moved ahead of the functions that read `seq`.
SET search_path TO smx, public;
SET check_function_bodies = off;

ALTER TABLE smx.oracle_events ADD COLUMN seq bigint GENERATED ALWAYS AS IDENTITY NOT NULL;
CREATE UNIQUE INDEX oracle_events_seq_idx ON oracle_events (seq);

CREATE OR REPLACE FUNCTION smx.exchange_json(p_limit integer)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'smx', 'public'
AS $function$
	SELECT jsonb_build_object(
		'totals', jsonb_build_object(
			'totalRaised', (
				SELECT coalesce(sum(c.raised_amount), 0)::TEXT
				FROM creators c WHERE c.status <> 'DRAFT'
			),
			'activeCreators', (
				SELECT count(*) FROM creators c WHERE c.status IN ('LIVE', 'GRACE')
			),
			'dividendsPaid', (
				SELECT coalesce(sum(d.amount_due), 0)::TEXT
				FROM dividends d WHERE d.status = 'PAID'
			),
			'holders', (
				SELECT count(DISTINCT h.wallet) FROM holdings h WHERE h.balance > 0
			)
		),
		'trending', (
			SELECT coalesce(jsonb_agg(creator_summary_json(t.c) ORDER BY t.rank), '[]')
			FROM (
				SELECT c, row_number() OVER (
					ORDER BY (c.status IN ('LIVE', 'GRACE')) DESC,
						(SELECT coalesce(sum(tr.usdc_amount), 0) FROM trades tr
							WHERE tr.creator_id = c.id
								AND tr.created_at > now() - interval '24 hours') DESC,
						c.raised_amount DESC, c.ticker
				) AS rank
				FROM creators c WHERE c.status <> 'DRAFT'
			) t
			WHERE t.rank <= p_limit
		),
		'events', (
			SELECT coalesce(jsonb_agg(oracle_event_json(e) ORDER BY e.created_at DESC, e.id), '[]')
			FROM oracle_events e
			WHERE e.id IN (SELECT y.id FROM oracle_events y  ORDER BY created_at DESC, id LIMIT 20)
		)
	)
$function$;
CREATE OR REPLACE FUNCTION smx.oracle_event_json(e oracle_events)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'smx', 'public'
AS $function$
	SELECT jsonb_build_object(
		'id', e.id,
		'seq', e.seq,
		'creatorId', e.creator_id,
		'ticker', e.payload ->> 'ticker',
		'kind', e.kind,
		'payload', e.payload,
		'createdAt', e.created_at
	)
$function$;
CREATE FUNCTION smx.oracle_events_since(p_since bigint, p_creator uuid, p_limit integer)
 RETURNS SETOF oracle_events
 LANGUAGE sql
 STABLE
 SET search_path TO 'smx', 'public'
AS $function$
	SELECT r.* FROM (
		SELECT e.* FROM oracle_events e
		WHERE e.seq > p_since AND (p_creator IS NULL OR e.creator_id = p_creator)
		ORDER BY e.seq DESC
		LIMIT least(greatest(p_limit, 0), 200)
	) r
	ORDER BY r.seq
$function$;
