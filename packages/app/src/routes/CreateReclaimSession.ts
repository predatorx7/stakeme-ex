import { notFound } from '@hapi/boom'
import assert from 'node:assert'
import { canonicalOrigin } from '../consts.ts'
import { createReclaimSession } from '../integrations/index.ts'
import { getOwnedCreator } from '../queries.ts'
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
	const session = await createReclaimSession({
		ticker: creator.ticker,
		callbackUrl: `${canonicalOrigin()}/reclaim/callback`,
		context: creator.id,
	})
	respondMutation(req, req.res!, {
		body: session,
		trigger: 'smx:reclaim-session',
	})
}
