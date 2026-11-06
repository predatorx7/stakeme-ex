SET search_path TO smx, public;

CREATE FUNCTION smx.activity_page_json(p_kind text, p_ticker text, p_after_key text, p_after_id text, p_limit integer)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'smx', 'public'
AS $function$
	WITH page AS (
		SELECT e, e.seq::TEXT AS k, e.id::TEXT AS i,
			row_number() OVER (ORDER BY e.seq DESC) AS n
		FROM oracle_events e
		WHERE (p_after_key IS NULL OR e.seq < p_after_key::BIGINT)
			AND (p_kind IS NULL OR e.kind = p_kind::oracle_event_kind)
			AND (
				p_ticker IS NULL OR e.creator_id IN (
					SELECT c.id FROM creators c WHERE c.ticker = p_ticker
				)
			)
		ORDER BY e.seq DESC
		LIMIT least(greatest(p_limit, 1), 100) + 1
	)
	SELECT jsonb_build_object(
		'items', coalesce((
			SELECT jsonb_agg(oracle_event_json(p.e) ORDER BY p.n)
			FROM page p WHERE p.n <= least(greatest(p_limit, 1), 100)
		), '[]'),
		'next', (
			SELECT jsonb_build_object('key', p.k, 'id', p.i)
			FROM page p
			WHERE p.n = least(greatest(p_limit, 1), 100)
				AND EXISTS (SELECT 1 FROM page x WHERE x.n > p.n)
		)
	)
$function$;
CREATE FUNCTION smx.creator_dividends_page_json(p_ticker text, p_after_key text, p_after_id text, p_limit integer)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'smx', 'public'
AS $function$
	WITH cr AS (
		SELECT c.id, c.ticker, c.display_name, c.status FROM creators c
		WHERE c.id = creator_id_by_ticker(p_ticker)
	),
	page AS (
		SELECT d, d.created_at::TEXT AS k, d.id::TEXT AS i,
			row_number() OVER (ORDER BY d.created_at DESC, d.id DESC) AS n
		FROM dividends d
		WHERE d.creator_id = (SELECT id FROM cr)
			AND (
				p_after_key IS NULL
				OR (d.created_at, d.id)
					< (p_after_key::TIMESTAMPTZ, p_after_id::UUID)
			)
		ORDER BY d.created_at DESC, d.id DESC
		LIMIT least(greatest(p_limit, 1), 100) + 1
	)
	SELECT jsonb_build_object(
		'creator', (
			SELECT jsonb_build_object(
				'ticker', cr.ticker, 'displayName', cr.display_name,
				'status', cr.status
			) FROM cr
		),
		'items', coalesce((
			SELECT jsonb_agg(dividend_json(p.d) ORDER BY p.n)
			FROM page p WHERE p.n <= least(greatest(p_limit, 1), 100)
		), '[]'),
		'next', (
			SELECT jsonb_build_object('key', p.k, 'id', p.i)
			FROM page p
			WHERE p.n = least(greatest(p_limit, 1), 100)
				AND EXISTS (SELECT 1 FROM page x WHERE x.n > p.n)
		)
	)
$function$;
CREATE FUNCTION smx.creator_holders_page_json(p_ticker text, p_after_key text, p_after_id text, p_limit integer)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'smx', 'public'
AS $function$
	WITH cr AS (
		SELECT c.id, c.ticker, c.display_name, c.status FROM creators c
		WHERE c.id = creator_id_by_ticker(p_ticker)
	),
	page AS (
		SELECT h, h.balance::TEXT AS k, h.wallet::TEXT AS i,
			row_number() OVER (ORDER BY h.balance DESC, h.wallet) AS n
		FROM holdings h
		WHERE h.creator_id = (SELECT id FROM cr) AND h.balance > 0
			AND (
				p_after_key IS NULL OR h.balance < p_after_key::NUMERIC
				OR (h.balance = p_after_key::NUMERIC AND h.wallet::TEXT > p_after_id)
			)
		ORDER BY h.balance DESC, h.wallet
		LIMIT least(greatest(p_limit, 1), 100) + 1
	)
	SELECT jsonb_build_object(
		'creator', (
			SELECT jsonb_build_object(
				'ticker', cr.ticker, 'displayName', cr.display_name,
				'status', cr.status
			) FROM cr
		),
		'items', coalesce((
			SELECT jsonb_agg(holding_json(p.h) ORDER BY p.n)
			FROM page p WHERE p.n <= least(greatest(p_limit, 1), 100)
		), '[]'),
		'next', (
			SELECT jsonb_build_object('key', p.k, 'id', p.i)
			FROM page p
			WHERE p.n = least(greatest(p_limit, 1), 100)
				AND EXISTS (SELECT 1 FROM page x WHERE x.n > p.n)
		)
	)
$function$;
CREATE OR REPLACE FUNCTION smx.creator_hub_json(p_user uuid)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'smx', 'public'
AS $function$
	SELECT coalesce((
		SELECT jsonb_strip_nulls(jsonb_build_object(
			'creator', creator_json(c),
			'pendingDividend', (
				SELECT dividend_json(d) FROM dividends d
				WHERE d.creator_id = c.id AND d.status = 'DUE'
				ORDER BY d.created_at LIMIT 1
			),
			'dividends', (
				SELECT coalesce(jsonb_agg(dividend_json(d) ORDER BY d.created_at DESC, d.id), '[]')
				FROM dividends d
			WHERE d.id IN (SELECT y.id FROM dividends y WHERE y.creator_id = c.id ORDER BY y.created_at DESC, y.id LIMIT 10)
			),
			'proofs', (
				SELECT coalesce(jsonb_agg(income_proof_json(p) ORDER BY p.created_at DESC, p.id), '[]')
				FROM income_proofs p
			WHERE p.id IN (SELECT y.id FROM income_proofs y WHERE y.creator_id = c.id ORDER BY y.created_at DESC, y.id LIMIT 10)
			),
			'chainJobs', (
				SELECT coalesce(jsonb_agg(chain_job_json(j) ORDER BY j.seq DESC), '[]')
				FROM chain_jobs j
			WHERE j.id IN (SELECT y.id FROM chain_jobs y WHERE y.creator_id = c.id ORDER BY y.seq DESC LIMIT 10)
			),
			'more', jsonb_build_object(
				'proofs', (SELECT count(*) > 10 FROM (SELECT 1 FROM income_proofs y WHERE y.creator_id = c.id LIMIT 11) y),
				'dividends', (SELECT count(*) > 10 FROM (SELECT 1 FROM dividends y WHERE y.creator_id = c.id LIMIT 11) y),
				'events', (SELECT count(*) > 0 FROM (SELECT 1 FROM oracle_events y WHERE y.creator_id = c.id LIMIT 1) y)
			),
			'collateral', jsonb_build_object(
				'stakeAmount', c.stake_amount::TEXT,
				'atRisk', c.status IN ('LIVE', 'GRACE')
			)
		))
		FROM creators c WHERE c.owner_user_id = p_user
	), '{}'::JSONB)
$function$;
CREATE OR REPLACE FUNCTION smx.creator_page_json(p_ticker text, p_wallet text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'smx', 'public'
AS $function$
	SELECT jsonb_strip_nulls(jsonb_build_object(
		'creator', creator_json(c),
		'chart', price_points_json(c.id, 500),
		'holders', (
			SELECT coalesce(jsonb_agg(holding_json(h) ORDER BY h.balance DESC, h.wallet), '[]')
			FROM holdings h
			WHERE (ROW(h.creator_id, h.wallet)) IN (SELECT y.creator_id, y.wallet FROM holdings y WHERE y.creator_id = c.id AND y.balance > 0 ORDER BY y.balance DESC, y.wallet LIMIT 20)
		),
		'trades', (
			SELECT coalesce(jsonb_agg(trade_json(t) ORDER BY t.created_at DESC, t.id), '[]')
			FROM trades t
			WHERE t.id IN (SELECT y.id FROM trades y WHERE y.creator_id = c.id ORDER BY y.created_at DESC, y.id LIMIT 20)
		),
		'events', (
			SELECT coalesce(jsonb_agg(oracle_event_json(e) ORDER BY e.created_at DESC, e.id), '[]')
			FROM oracle_events e
			WHERE e.id IN (SELECT y.id FROM oracle_events y WHERE y.creator_id = c.id ORDER BY y.created_at DESC, y.id LIMIT 20)
		),
		'proofs', (
			SELECT coalesce(jsonb_agg(income_proof_json(p) ORDER BY p.created_at DESC, p.id), '[]')
			FROM income_proofs p
			WHERE p.id IN (SELECT y.id FROM income_proofs y WHERE y.creator_id = c.id ORDER BY y.created_at DESC, y.id LIMIT 10)
		),
		'dividends', (
			SELECT coalesce(jsonb_agg(dividend_json(d) ORDER BY d.created_at DESC, d.id), '[]')
			FROM dividends d
			WHERE d.id IN (SELECT y.id FROM dividends y WHERE y.creator_id = c.id ORDER BY y.created_at DESC, y.id LIMIT 10)
		),
		-- "View all" flags: true when the full list holds more than shown here.
		'more', jsonb_build_object(
			'holders', (SELECT count(*) > 20 FROM (SELECT 1 FROM holdings y WHERE y.creator_id = c.id AND y.balance > 0 LIMIT 21) y),
			'trades', (SELECT count(*) > 20 FROM (SELECT 1 FROM trades y WHERE y.creator_id = c.id LIMIT 21) y),
			'events', (SELECT count(*) > 20 FROM (SELECT 1 FROM oracle_events y WHERE y.creator_id = c.id LIMIT 21) y),
			'proofs', (SELECT count(*) > 10 FROM (SELECT 1 FROM income_proofs y WHERE y.creator_id = c.id LIMIT 11) y),
			'dividends', (SELECT count(*) > 10 FROM (SELECT 1 FROM dividends y WHERE y.creator_id = c.id LIMIT 11) y)
		),
		'viewer', jsonb_build_object(
			'wallet', p_wallet,
			'holding', (
				SELECT holding_json(h) FROM holdings h
				WHERE h.creator_id = c.id AND h.wallet = p_wallet::evm_address
			)
		)
	))
	FROM creators c WHERE c.ticker = p_ticker
$function$;
CREATE FUNCTION smx.creator_proofs_page_json(p_ticker text, p_after_key text, p_after_id text, p_limit integer)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'smx', 'public'
AS $function$
	WITH cr AS (
		SELECT c.id, c.ticker, c.display_name, c.status FROM creators c
		WHERE c.id = creator_id_by_ticker(p_ticker)
	),
	page AS (
		SELECT x, x.created_at::TEXT AS k, x.id::TEXT AS i,
			row_number() OVER (ORDER BY x.created_at DESC, x.id DESC) AS n
		FROM income_proofs x
		WHERE x.creator_id = (SELECT id FROM cr)
			AND (
				p_after_key IS NULL
				OR (x.created_at, x.id)
					< (p_after_key::TIMESTAMPTZ, p_after_id::UUID)
			)
		ORDER BY x.created_at DESC, x.id DESC
		LIMIT least(greatest(p_limit, 1), 100) + 1
	)
	SELECT jsonb_build_object(
		'creator', (
			SELECT jsonb_build_object(
				'ticker', cr.ticker, 'displayName', cr.display_name,
				'status', cr.status
			) FROM cr
		),
		'items', coalesce((
			SELECT jsonb_agg(income_proof_json(p.x) ORDER BY p.n)
			FROM page p WHERE p.n <= least(greatest(p_limit, 1), 100)
		), '[]'),
		'next', (
			SELECT jsonb_build_object('key', p.k, 'id', p.i)
			FROM page p
			WHERE p.n = least(greatest(p_limit, 1), 100)
				AND EXISTS (SELECT 1 FROM page x WHERE x.n > p.n)
		)
	)
$function$;
CREATE FUNCTION smx.creator_trades_page_json(p_ticker text, p_after_key text, p_after_id text, p_limit integer)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'smx', 'public'
AS $function$
	WITH cr AS (
		SELECT c.id, c.ticker, c.display_name, c.status FROM creators c
		WHERE c.id = creator_id_by_ticker(p_ticker)
	),
	page AS (
		SELECT t, t.created_at::TEXT AS k, t.id::TEXT AS i,
			row_number() OVER (ORDER BY t.created_at DESC, t.id DESC) AS n
		FROM trades t
		WHERE t.creator_id = (SELECT id FROM cr)
			AND (
				p_after_key IS NULL
				OR (t.created_at, t.id)
					< (p_after_key::TIMESTAMPTZ, p_after_id::UUID)
			)
		ORDER BY t.created_at DESC, t.id DESC
		LIMIT least(greatest(p_limit, 1), 100) + 1
	)
	SELECT jsonb_build_object(
		'creator', (
			SELECT jsonb_build_object(
				'ticker', cr.ticker, 'displayName', cr.display_name,
				'status', cr.status
			) FROM cr
		),
		'items', coalesce((
			SELECT jsonb_agg(trade_json(p.t) ORDER BY p.n)
			FROM page p WHERE p.n <= least(greatest(p_limit, 1), 100)
		), '[]'),
		'next', (
			SELECT jsonb_build_object('key', p.k, 'id', p.i)
			FROM page p
			WHERE p.n = least(greatest(p_limit, 1), 100)
				AND EXISTS (SELECT 1 FROM page x WHERE x.n > p.n)
		)
	)
$function$;
CREATE FUNCTION smx.creators_page_json(p_sort text, p_status text, p_q text, p_after_key text, p_after_id text, p_limit integer)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'smx', 'public'
AS $function$
	WITH base AS (
		SELECT c,
			(c.status IN ('LIVE', 'GRACE'))::INTEGER AS active,
			CASE WHEN p_sort = 'trending' THEN (
				SELECT coalesce(sum(tr.usdc_amount), 0) FROM trades tr
				WHERE tr.creator_id = c.id
					AND tr.created_at > now() - interval '24 hours'
			) ELSE 0 END AS vol
		FROM creators c
		WHERE c.status <> 'DRAFT'
			AND (p_status IS NULL OR c.status = upper(p_status)::creator_status)
			AND (
				coalesce(p_q, '') = '' OR (
					c.ticker ILIKE '%' || replace(replace(replace(
						p_q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
					OR c.display_name ILIKE '%' || replace(replace(replace(
						p_q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
				)
			)
	),
	page AS (
		SELECT b.c,
			CASE p_sort
				WHEN 'newest' THEN (b.c).created_at::TEXT
				WHEN 'raised' THEN (b.c).raised_amount::TEXT
				ELSE b.active || '|' || b.vol || '|' || (b.c).raised_amount
			END AS k,
			CASE p_sort WHEN 'newest' THEN (b.c).id::TEXT ELSE (b.c).ticker END AS i,
			row_number() OVER (ORDER BY
				CASE WHEN p_sort NOT IN ('newest', 'raised') THEN b.active END DESC,
				CASE WHEN p_sort NOT IN ('newest', 'raised') THEN b.vol END DESC,
				CASE WHEN p_sort = 'newest' THEN (b.c).created_at END DESC,
				CASE WHEN p_sort = 'newest' THEN (b.c).id END DESC,
				CASE WHEN p_sort <> 'newest' THEN (b.c).raised_amount END DESC,
				(b.c).ticker
			) AS n
		FROM base b
		WHERE p_after_key IS NULL OR CASE p_sort
			WHEN 'newest' THEN
				((b.c).created_at, (b.c).id)
					< (p_after_key::TIMESTAMPTZ, p_after_id::UUID)
			WHEN 'raised' THEN
				(b.c).raised_amount < p_after_key::NUMERIC
				OR ((b.c).raised_amount = p_after_key::NUMERIC
					AND (b.c).ticker > p_after_id)
			ELSE
				(b.active, b.vol, (b.c).raised_amount) < (
					split_part(p_after_key, '|', 1)::INTEGER,
					split_part(p_after_key, '|', 2)::NUMERIC,
					split_part(p_after_key, '|', 3)::NUMERIC
				)
				OR (
					(b.active, b.vol, (b.c).raised_amount) = (
						split_part(p_after_key, '|', 1)::INTEGER,
						split_part(p_after_key, '|', 2)::NUMERIC,
						split_part(p_after_key, '|', 3)::NUMERIC
					) AND (b.c).ticker > p_after_id
				)
		END
		ORDER BY n
		LIMIT least(greatest(p_limit, 1), 100) + 1
	)
	SELECT jsonb_build_object(
		'items', coalesce((
			SELECT jsonb_agg(creator_summary_json(p.c) ORDER BY p.n)
			FROM page p WHERE p.n <= least(greatest(p_limit, 1), 100)
		), '[]'),
		'next', (
			SELECT jsonb_build_object('key', p.k, 'id', p.i)
			FROM page p
			WHERE p.n = least(greatest(p_limit, 1), 100)
				AND EXISTS (SELECT 1 FROM page x WHERE x.n > p.n)
		)
	)
$function$;
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
		),
		-- "View all" flags: true when the full pages hold more than the widgets.
		'hasMoreTrending', (
			SELECT count(*) > p_limit FROM creators c WHERE c.status <> 'DRAFT'
		),
		'hasMoreEvents', (SELECT count(*) > 20 FROM (SELECT 1 FROM oracle_events LIMIT 21) y)
	)
$function$;
CREATE INDEX creators_ticker_trgm_idx ON smx.creators USING gin (ticker gin_trgm_ops);
CREATE INDEX creators_name_trgm_idx ON smx.creators USING gin (display_name gin_trgm_ops);
CREATE INDEX creators_created_idx ON smx.creators (created_at DESC, id DESC);
CREATE INDEX holdings_creator_balance_idx ON smx.holdings (creator_id, balance DESC, wallet) WHERE balance::numeric > 0::numeric;
CREATE INDEX income_proofs_creator_idx ON smx.income_proofs (creator_id, created_at DESC, id DESC);
CREATE INDEX oracle_events_creator_seq_idx ON smx.oracle_events (creator_id, seq DESC);