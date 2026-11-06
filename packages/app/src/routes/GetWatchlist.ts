import { getWatchlist } from '../queries.ts'
import type { ITypedExpressRequest } from '../types/openapi.ts'

/** `GET /watchlist` — the viewer's watched creators (auth required). */
export default async function GetWatchlist(
	req: ITypedExpressRequest<'GetWatchlist'>,
) {
	const [row] = await getWatchlist.run(
		{ viewer_id: req.authMetadata!.id },
		req.pg,
	)
	req.res!.json(row.j)
}
