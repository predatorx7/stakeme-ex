import { notFound } from '@hapi/boom'
import assert from 'node:assert'
import { finishReclaimSession, getOwnedReclaimSession } from '../queries.ts'
import { createOracle } from '../services/index.ts'
import type { ITypedExpressRequest } from '../types/openapi.ts'

/**
 * `GET /reclaim/sessions/{sessionId}` — polling fallback for the SSE feed.
 * While pending, asks Reclaim for the live status and records a failure the
 * callback has not delivered yet. A remote success stays PENDING until the
 * callback's proof is audited.
 */
export default async function GetReclaimSessionStatus(
	req: ITypedExpressRequest<'GetReclaimSessionStatus'>,
) {
	const args = {
		id: req.params.sessionId,
		viewer_id: req.authMetadata!.id,
	}
	let [row] = await getOwnedReclaimSession.run(args, req.pg)
	assert(row, notFound('Reclaim session not found'))
	if((row.j as { status?: string }).status === 'PENDING') {
		const remote = await createOracle().getProofRequestStatus(args.id)
		if(remote && remote !== 'PENDING' && remote !== 'SUCCESS') {
			await finishReclaimSession.run(
				{ id: args.id, status: remote, reason: `Reclaim: ${remote}` },
				req.pg,
			)
			const [updated] = await getOwnedReclaimSession.run(args, req.pg)
			row = updated
		}
	}

	req.res!.json(row.j)
}
