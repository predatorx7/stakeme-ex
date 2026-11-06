import { getCreatorCandles } from '../queries.ts'
import type { ITypedExpressRequest } from '../types/openapi.ts'

/** `GET /creators/{ticker}/candles` — OHLCV candles for the chart. */
export default async function GetCreatorCandles(
	req: ITypedExpressRequest<'GetCreatorCandles'>,
) {
	const [row] = await getCreatorCandles.run(
		{ ticker: req.params.ticker, interval: req.query.interval },
		req.pg,
	)
	req.res!.json(row.j)
}
