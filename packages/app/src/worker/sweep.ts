import { SWEEP_INTERVAL_S } from '../consts.ts'
import { LOGGER } from '../logger.ts'
import { useAppSchema } from '../pgmb.ts'
import { sweepDeadlines } from '../queries.ts'
import type { IPgClientLike } from '../types/index.ts'

/**
 * Runs `smx.sweep_deadlines()` on a timer. One in-process timer serves both
 * PGlite (no pg_cron) and Postgres: the SQL function takes `FOR UPDATE SKIP
 * LOCKED`, so several app replicas sweeping at once never double-act.
 * `SWEEP_INTERVAL_S=0` disables it. Returns a `stop` hook.
 */
export function startDeadlineSweep(pg: IPgClientLike) {
	if(!SWEEP_INTERVAL_S) {
		return () => {}
	}

	const timer = setInterval(() => void sweepOnce(pg), SWEEP_INTERVAL_S * 1000)
	timer.unref()
	return () => clearInterval(timer)
}

export async function sweepOnce(pg: IPgClientLike) {
	try {
		await useAppSchema(pg)
		const moved = await sweepDeadlines.run(undefined, pg)
		if(moved.length) {
			LOGGER.info({ moved }, 'deadline sweep changed creators')
		}

		return moved
	} catch(err) {
		LOGGER.error({ err }, 'deadline sweep failed')
		return []
	}
}
