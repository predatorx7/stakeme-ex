import { deleteWatchlistItem } from '../queries.ts'
import type { ITypedExpressRequest } from '../types/openapi.ts'

/** `DELETE /watchlist/{ticker}` — idempotent remove (auth required). */
export default async function DeleteWatchlistItem(
	req: ITypedExpressRequest<'DeleteWatchlistItem'>,
) {
	await deleteWatchlistItem.run(
		{ viewer_id: req.authMetadata!.id, ticker: req.params.ticker },
		req.pg,
	)
	req.res!.status(204).end()
}
