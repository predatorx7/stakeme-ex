/**
 * The pgmb (Postgres message broker) hub, backed by @haathie/pgmb. Producers
 * publish inside the request's transaction through `req.pg`; consumers are
 * registered in `worker/register.ts` and run on a separate pool (see
 * `initPgmbPool` in db.ts).
 */
import { PgmbClient } from '@haathie/pgmb'
import assert from 'node:assert'
import type { IPgClientLike } from './types/misc.ts'
import { PGMB_GROUP_ID } from './consts.ts'
import { LOGGER } from './logger.ts'

/**
 * pgmb's routines `SET search_path TO pgmb` on the connection they run on, and
 * that outlives the call. Reliable handlers get that same connection, so app
 * SQL would resolve unqualified names against `pgmb` alone. Call this at the
 * start of every handler.
 */
export async function useAppSchema(pg: IPgClientLike) {
	await pg.query('SET search_path TO smx, public', [])
}

let client: PgmbClient | undefined

/** Constructs the singleton pgmb client over a pg pool (prod) or PGlite
 *  (dev and tests). */
export function createPgmbClient(
	pg: IPgClientLike,
	overrides: Record<string, unknown> = {},
): PgmbClient {
	client = new PgmbClient({
		// pgmb's PgClientLike is structural ({ query, exec? } | pool); both a
		// node-pg Pool and a PGlite instance satisfy it.
		client: pg as never,
		groupId: PGMB_GROUP_ID,
		logger: LOGGER,
		...overrides,
	})
	return client
}

export function getPgmbClient(): PgmbClient {
	assert(client, 'pgmb client not initialised; call createPgmbClient first')
	return client
}

/** Like `getPgmbClient`, but returns undefined when not wired. */
export function peekPgmbClient(): PgmbClient | undefined {
	return client
}

/** Stops the singleton pgmb client, if one was created. */
export async function endPgmb() {
	const c = client
	client = undefined
	await c?.end()
}
