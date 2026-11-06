import { notFound } from '@hapi/boom'
import assert from 'node:assert'
import { canonicalOrigin } from '../consts.ts'
import { createReclaimSessionRow, getOwnedCreator } from '../queries.ts'
import { createOracle } from '../services/index.ts'
import type { ITypedExpressRequest } from '../types/openapi.ts'
import { respondMutation } from '../utils/mutation.ts'

/** `POST /creators/{ticker}/reclaim-sessions` — start an income proof. */
export default async function CreateReclaimSessionRoute(
	req: ITypedExpressRequest<'CreateReclaimSession'>,
) {
	const [creator] = await getOwnedCreator.run(
		{ ticker: req.params.ticker, viewer_id: req.authMetadata!.id },
		req.pg,
	)
	assert(creator, notFound('Creator not found'))
	const session = await createOracle().createProofRequest({
		ticker: creator.ticker,
		callbackUrl: `${canonicalOrigin()}/reclaim/callback`,
		context: creator.id,
	})
	await createReclaimSessionRow.run(
		{
			id: session.sessionId,
			creator_id: creator.id,
			org_id: session.orgId ?? null,
		},
		req.pg,
	)
	respondMutation(req, req.res!, {
		body: {
			sessionId: session.sessionId,
			requestUrl: session.requestUrl,
			statusUrl: session.statusUrl,
		},
		trigger: 'smx:reclaim-session',
	})
}
