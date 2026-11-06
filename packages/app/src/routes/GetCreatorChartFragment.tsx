import type { Candle } from '../components/charts/CandleChart.tsx'
import { ChartRegion } from '../components/charts/CandleChart.tsx'
import { getCreatorCandles } from '../queries.ts'
import type { ITypedExpressRequest } from '../types/openapi.ts'

/** `GET /creators/{ticker}/chart` — the chart region as an HTML fragment. */
export default async function GetCreatorChartFragment(
	req: ITypedExpressRequest<'GetCreatorChartFragment'>,
) {
	const { ticker } = req.params
	const interval = req.query.interval ?? '1D'
	const mode = req.query.mode ?? 'candles'
	const [row] = await getCreatorCandles.run({ ticker, interval }, req.pg)
	const { items } = row.j as { items: Candle[] }
	return (
		<ChartRegion
			ticker={ticker}
			interval={interval}
			mode={mode}
			candles={items} />
	)
}
