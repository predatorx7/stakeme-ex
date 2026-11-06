import { Pool, type PoolConfig } from 'pg'
import { DB_URI, MAX_DB_CONNS, PG_APP_NAME } from './consts.ts'
import { LOGGER } from './logger.ts'

function createPool(name: string, config: Partial<PoolConfig>) {
	const pool = new Pool({
		connectionString: DB_URI,
		application_name: name,
		// timezone=UTC is load-bearing, not hygiene: Postgres renders TIMESTAMPTZ
		// in the SESSION timezone, and the API's date-times are built in SQL
		// (jsonb_build_object). Unpinned, the same row serializes as `+05:00` on a
		// dev laptop and `+00:00` in prod — a server-dependent API response.
		options: '-c search_path=smx -c timezone=UTC',
		...config,
	})
	pool.on('error', (err) => {
		LOGGER.error({ err, pool: name }, 'unexpected pg pool error')
	})
	return pool
}

/** The pool every request and worker query runs on. */
export function initPgPool() {
	return createPool(PG_APP_NAME, { max: MAX_DB_CONNS })
}

/**
 * A pool used ONLY by pgmb's background loops. Kept separate because
 * `pgmb.maintain_events_table` issues a session-level `SET search_path TO pgmb`
 * that outlives the CALL: on a shared pool that connection then resolves
 * unqualified `smx` names against `pgmb` alone, and the next app query on
 * it
 * fails with 42883. Isolating it means only pgmb's own connections carry that
 * search_path, and they only ever run pgmb SQL.
 *
 * Publishing is unaffected — `publishDelivery` writes through the caller's `pg`
 * so it stays inside the request's transaction.
 */
export function initPgmbPool() {
	return createPool(`${PG_APP_NAME}_pgmb`, { max: 4 })
}
