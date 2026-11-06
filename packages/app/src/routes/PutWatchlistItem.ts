import { putWatchlistItem } from '../queries.ts'
import type { ITypedExpressRequest } from '../types/openapi.ts'

/** `PUT /watchlist/{ticker}` — idempotent add (auth required). */
export default async function PutWatchlistItem(
	req: ITypedExpressRequest<'PutWatchlistItem'>,
) {
	const [row] = await putWatchlistItem.run(
		{ viewer_id: req.authMetadata!.id, ticker: req.params.ticker },
		req.pg,
	)
	req.res!.json(row.j)
}
