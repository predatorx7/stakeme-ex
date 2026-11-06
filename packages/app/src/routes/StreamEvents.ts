import { createTopicalSubscriptionParams } from '@haathie/pgmb'
import { notFound, serverUnavailable } from '@hapi/boom'
import assert from 'node:assert'
import { OracleEventItem } from '../components/events/OracleEventItem.tsx'
import { getCreatorIdByTicker } from '../queries.ts'
import type { OracleEvent } from '../types/index.ts'
import type { ITypedExpressRequest } from '../types/openapi.ts'

export const ORACLE_EVENTS_TOPIC = 'smx.oracle_events.insert'
export const CHAIN_JOBS_UPDATE_TOPIC = 'smx.chain_jobs.update'
const KEEPALIVE_MS = 25_000

/**
 * `GET /events` — SSE of pgmb events. The `oracle_events` insert trigger
 * (ddl.sql) feeds `oracle-event` (HTML fragment for htmx `sse-swap`) and
 * `oracle-event-json`; the `chain_jobs` update trigger feeds `chain-job`, so
 * the UI clears its "pending" badge when the worker settles a call.
 * No replay: a reconnecting page re-renders from the page document.
 */
export default async function StreamEvents(
	req: ITypedExpressRequest<'StreamEvents'>,
) {
	const res = req.res!
	assert(req.pgmb, serverUnavailable('Event stream is not available'))

	let creatorId: string | undefined
	if(req.query.ticker) {
		const [row] = await getCreatorIdByTicker.run(
			{ ticker: req.query.ticker }, req.pg,
		)
		assert(row, notFound('Creator not found'))
		creatorId = row.id
	}

	const sub = await req.pgmb.registerFireAndForgetHandler(
		createTopicalSubscriptionParams({
			topics: [ORACLE_EVENTS_TOPIC, CHAIN_JOBS_UPDATE_TOPIC],
			// Insert payloads carry creator_id; update payloads are diffs, so the
			// unchanged creator_id is in metadata.old.
			additionalFilters: creatorId
				? {
					creatorId: 'coalesce(e.payload->>\'creator_id\', '
						+ 'e.metadata->\'old\'->>\'creator_id\')',
				}
				: {},
			additionalParams: creatorId ? { creatorId } : {},
			expiryInterval: '10 minutes',
		}),
	)
	const keepalive = setInterval(() => res.write(': ping\n\n'), KEEPALIVE_MS)
	res.once('close', () => {
		clearInterval(keepalive)
		void sub.return()
	})
	res.writeHead(200, {
		'content-type': 'text/event-stream',
		'cache-control': 'no-cache',
		'connection': 'keep-alive',
	})
	res.flushHeaders()

	try {
		for await (const { items } of sub) {
			for(const item of items) {
				const p = item.payload as Record<string, unknown>
				if(item.topic === ORACLE_EVENTS_TOPIC) {
					const event: OracleEvent = {
						id: String(p.id),
						creatorId: String(p.creator_id),
						ticker: String((p.payload as { ticker?: string })?.ticker),
						kind: p.kind as OracleEvent['kind'],
						payload: (p.payload ?? {}) as OracleEvent['payload'],
						createdAt: String(p.created_at),
					}
					const html = await Promise.resolve(OracleEventItem({ event }))
					write(item.id, 'oracle-event', html)
					write(item.id, 'oracle-event-json', JSON.stringify(event))
				} else {
					const old = (item.metadata as { old?: Record<string, unknown> })
						?.old ?? {}
					const row = { ...old, ...p }
					write(item.id, 'chain-job', JSON.stringify({
						id: row.id,
						creatorId: row.creator_id,
						fn: row.fn,
						status: row.status,
						txHash: row.tx_hash,
					}))
				}
			}
		}
	} catch{
		if(!res.writableEnded) {
			res.end()
		}
	}

	function write(id: string, event: string, data: string) {
		const body = data.split(/\r\n|\r|\n/).map((l) => `data: ${l}`).join('\n')
		res.write(`id: ${id}\nevent: ${event}\n${body}\n\n`)
	}
}
