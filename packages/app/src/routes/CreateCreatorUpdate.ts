import { createCreatorUpdate } from '../queries.ts'
import type { ITypedExpressRequest } from '../types/openapi.ts'
import { respondMutation } from '../utils/mutation.ts'

/**
 * `POST /creators/{ticker}/updates` — the creator's owner posts an update.
 * SQL checks ownership (403), the 5-per-day limit (429) and the link; it also
 * emits `CREATOR_UPDATE`. htmx callers go back to the hub, which shows the
 * refreshed allowance.
 */
export default async function CreateCreatorUpdateRoute(
	req: ITypedExpressRequest<'CreateCreatorUpdate'>,
) {
	const [row] = await createCreatorUpdate.run(
		{
			viewer_id: req.authMetadata!.id,
			ticker: req.params.ticker,
			body: req.body.body,
			link: req.body.link ?? null,
		},
		req.pg,
	)
	respondMutation(req, req.res!, {
		body: row.j,
		redirect: '/hub',
		trigger: 'smx:creator-update-posted',
	})
}
