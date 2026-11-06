import { payDividend } from '../queries.ts'
import type { ITypedExpressRequest } from '../types/openapi.ts'
import { respondMutation } from '../utils/mutation.ts'

/** `POST /dividends/{dividendId}/payment` — the creator pays a dividend. */
export default async function PayDividendRoute(
	req: ITypedExpressRequest<'PayDividend'>,
) {
	const [row] = await payDividend.run(
		{ dividend_id: req.params.dividendId, viewer_id: req.authMetadata!.id },
		req.pg,
	)
	respondMutation(req, req.res!, { body: row.j, trigger: 'smx:dividend-paid' })
}
