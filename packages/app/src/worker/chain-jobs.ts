import { CHAIN_JOB_BATCH, DEMO_MODE } from '../consts.ts'
import type { ChainFn } from '../integrations/index.ts'
import { sendChainJob } from '../integrations/index.ts'
import { LOGGER } from '../logger.ts'
import {
	claimChainJob,
	completeChainJob,
	getDemoEpoch,
	listQueuedChainJobs,
	requeueFailedChainJobs,
	setChainJobPool,
} from '../queries.ts'
import type { IPgClientLike } from '../types/index.ts'

let running: Promise<number> | undefined

/**
 * Sends every QUEUED chain job, oldest first. Mutations already committed the
 * final DB state (optimistic UI); this settles the onchain side and the
 * `complete_chain_job` update fires the SSE `chain-job` event. A job that
 * throws is marked FAILED with the error. Transient relay failures are
 * requeued on a later pass (see `RequeueFailedChainJobs`); reverts are not.
 * Calls overlap-safe: a second call while one is draining joins it. Returns
 * the number of jobs settled.
 */
export function processChainJobs(pg: IPgClientLike): Promise<number> {
	running ||= drain(pg).finally(() => {
		running = undefined
	})
	return running
}

async function drain(pg: IPgClientLike) {
	let settled = 0
	// Relay hiccups (Hashio 502s, timeouts) never reached the chain: retry
	// them. Reverts stay FAILED and keep blocking that creator's later jobs.
	const retried = await requeueFailedChainJobs.run(
		{ ticker: null, transient_only: true },
		pg,
	)
	if(retried.length) {
		LOGGER.info({ jobs: retried.map((r) => r.fn) }, 'retrying chain jobs')
	}

	for(;;) {
		const jobs = await listQueuedChainJobs.run({ batch: CHAIN_JOB_BATCH }, pg)
		if(!jobs.length) {
			return settled
		}

		for(const queued of jobs) {
			// Claiming makes the pass safe against a second worker process.
			const [job] = await claimChainJob.run({ id: queued.id }, pg)
			if(!job) {
				continue
			}

			await settle(pg, job)
			settled++
		}
	}
}

async function settle(
	pg: IPgClientLike,
	job: {
		id: string
		fn: string
		args: unknown
		contract_address: string | null
	},
) {
	try {
		// The demo epoch scopes the onchain nullifier hash (demo mode only).
		const demoEpoch = DEMO_MODE && job.fn === 'createISA'
			? await currentDemoEpoch(pg)
			: undefined
		const result = await sendChainJob({
			id: job.id,
			// Cast: `fn` is constrained by a CHECK in chain_jobs to ChainFn values.
			fn: job.fn as ChainFn,
			// Cast: `args` is built by SQL as a JSON object.
			args: {
				...job.args as Record<string, unknown>,
				...demoEpoch === undefined ? {} : { demoEpoch },
			},
			contractAddress: job.contract_address,
		})
		await completeChainJob.run(
			{
				id: job.id,
				status: result.status,
				tx_hash: result.txHash,
				error: result.error ?? null,
				isa: result.deployed?.isa ?? null,
				token: result.deployed?.token ?? null,
				ats_token: result.deployed?.atsToken ?? null,
			},
			pg,
		)
		if(result.deployed?.pool) {
			await setChainJobPool.run(
				{ job_id: job.id, pool: result.deployed.pool },
				pg,
			)
		}
	} catch(err) {
		LOGGER.error({ err, jobId: job.id, fn: job.fn }, 'chain job failed')
		await completeChainJob.run(
			{
				id: job.id,
				status: 'FAILED',
				tx_hash: null,
				error: err instanceof Error ? err.message.slice(0, 1000) : 'failed',
				isa: null,
				token: null,
				ats_token: null,
			},
			pg,
		)
	}
}

async function currentDemoEpoch(pg: IPgClientLike) {
	const [row] = await getDemoEpoch.run(undefined, pg)
	return row.epoch
}
