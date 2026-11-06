CREATE OR REPLACE FUNCTION smx.holding_json(h smx.holdings)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'smx', 'public'
AS $function$
	SELECT jsonb_strip_nulls(jsonb_build_object(
		'creatorId', h.creator_id,
		'ticker', (SELECT c.ticker FROM creators c WHERE c.id = h.creator_id),
		'wallet', h.wallet::TEXT,
		'userId', (
			SELECT w.user_id FROM wallet_addresses w
			WHERE w.address = h.wallet
			ORDER BY w.is_primary DESC, w.created_at
			LIMIT 1
		),
		'balance', h.balance::TEXT,
		'sharePct', (
			SELECT round(h.balance / nullif(sum(x.balance), 0) * 100, 2)
			FROM holdings x WHERE x.creator_id = h.creator_id
		),
		'value', trunc(h.balance * coalesce(pool_price(h.creator_id), 0), 6)::TEXT
	))
$function$;
