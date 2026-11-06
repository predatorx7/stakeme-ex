import { createTopicalSubscriptionParams, type PgmbClient } from '@haathie/pgmb'
import { CHAIN_JOB_RETRIES_S } from '../consts.ts'
import { LOGGER } from '../logger.ts'
import { useAppSchema } from '../pgmb.ts'
import type { IPgClientLike } from '../types/index.ts'
import { processChainJobs } from './chain-jobs.ts'
import { type DividendPaidPayload, streamPaidDividend } from './dividends.ts'
import { startDeadlineSweep } from './sweep.ts'

/** pgmb topics fed by triggers in ddl.sql. */
const CHAIN_JOBS_INSERT = 'smx.chain_jobs.insert'
const ORACLE_EVENTS_INSERT = 'smx.oracle_events.insert'
/** Safety net for a missed wake-up (or jobs queued while the app was down). */
const CHAIN_POLL_MS = 15_000

/**
 * Starts every background consumer and sweep:
 * - chain jobs: woken by `smx.chain_jobs.insert`, plus a boot drain and a poll;
 * - dividend streaming: `smx.oracle_events.insert` rows of kind DIVIDEND_PAID;
 * - deadline sweep (LIVE to GRACE to DEFAULTED).
 *
 * Runs in the HTTP process (see `server.ts`). pgmb must sit on its own pool.
 */
export const runWorkers = async(
	pg: IPgClientLike,
	options: { pgmb?: PgmbClient } = {},
) => {
	const stops: Array<() => void> = []
	const drain = async() => {
		try {
			await useAppSchema(pg)
			await processChainJobs(pg)
		} catch(err) {
			LOGGER.error({ err }, 'chain job drain failed')
		}
	}

	if(options.pgmb) {
		const chain = await options.pgmb.registerReliableHandler(
			{
				...createTopicalSubscriptionParams({ topics: [CHAIN_JOBS_INSERT] }),
				name: 'chain-jobs',
			},
			async(_item, ctx) => {
				await useAppSchema(ctx.client)
				await processChainJobs(ctx.client)
			},
		)
		stops.push(chain.cancel)

		const dividends = await options.pgmb.registerReliableHandler(
			{
				...createTopicalSubscriptionParams({
					topics: [ORACLE_EVENTS_INSERT],
				}),
				name: 'dividend-stream',
				retryOpts: { retriesS: CHAIN_JOB_RETRIES_S },
			},
			async(item, ctx) => {
				const client = ctx.client as IPgClientLike
				await useAppSchema(client)
				for(const event of item.items) {
					// Cast: the topic's payload is `to_jsonb(oracle_events)`.
					await streamPaidDividend(client, event.payload as DividendPaidPayload)
				}
			},
		)
		stops.push(dividends.cancel)
	}

	await drain()
	const poll = setInterval(() => void drain(), CHAIN_POLL_MS)
	poll.unref()
	stops.push(() => clearInterval(poll))
	stops.push(startDeadlineSweep(pg))
	LOGGER.debug({ pgmb: !!options.pgmb }, 'workers started')

	return {
		stop: () => {
			for(const stop of stops) {
				stop()
			}
		},
	}
}
