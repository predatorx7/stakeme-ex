import { escapeText } from '../../utils/escape.ts'
import { formatUsdc } from '../../utils/money.ts'
import { ChartFrame } from './ChartFrame.tsx'
import { ChartPlot } from './ChartPlot.tsx'
import { PriceChart } from './PriceChart.tsx'

export type Candle = {
	t: string
	o: string
	h: string
	l: string
	c: string
	v: string
}

export type ChartInterval = '1H' | '1D' | '1W' | 'ALL'
export type ChartMode = 'line' | 'candles'

const INTERVALS: Array<{ id: ChartInterval, label: string }> = [
	{ id: '1H', label: '1H' },
	{ id: '1D', label: '1D' },
	{ id: '1W', label: '1W' },
	{ id: 'ALL', label: 'All' },
]

const MODES: Array<{ id: ChartMode, label: string }> = [
	{ id: 'line', label: 'Line' },
	{ id: 'candles', label: 'Candles' },
]

const DATE = new Intl.DateTimeFormat('en-US', {
	month: 'short',
	day: 'numeric',
	timeZone: 'UTC',
})

const BODY_RATIO = 0.64

/** Interval tabs and a Line/Candles toggle. Each is a link that swaps the
 *  `#smx-chart` region and pushes the URL, so it also works without script. */
export function ChartToolbar({ ticker, interval, mode }: {
	ticker: string
	interval: ChartInterval
	mode: ChartMode
}) {
	const href = (nextInterval: ChartInterval, nextMode: ChartMode) => (
		`/creators/${encodeURIComponent(ticker)}`
		+ `?mode=${nextMode}&interval=${nextInterval}`
	)
	const fragment = (nextInterval: ChartInterval, nextMode: ChartMode) => (
		`/creators/${encodeURIComponent(ticker)}/chart`
		+ `?mode=${nextMode}&interval=${nextInterval}`
	)

	return (
		<nav
			class='smx-chart-toolbar'
			aria-label='Chart range and type'>
			<ul
				class='smx-chart-toolbar__group'
				data-group='interval'>
				{
					INTERVALS.map((i) => (
						<li>
							<a
								href={href(i.id, mode)}
								hx-get={fragment(i.id, mode)}
								hx-target='#smx-chart'
								hx-swap='outerHTML'
								hx-push-url={href(i.id, mode)}
								aria-current={i.id === interval ? 'true' : undefined}
								data-chart-interval={i.id}>
								{escapeText(i.label)}
							</a>
						</li>
					))
				}
			</ul>
			<ul
				class='smx-chart-toolbar__group'
				data-group='mode'>
				{
					MODES.map((m) => (
						<li>
							<a
								href={href(interval, m.id)}
								hx-get={fragment(interval, m.id)}
								hx-target='#smx-chart'
								hx-swap='outerHTML'
								hx-push-url={href(interval, m.id)}
								aria-current={m.id === mode ? 'true' : undefined}
								data-chart-mode={m.id}>
								{escapeText(m.label)}
							</a>
						</li>
					))
				}
			</ul>
		</nav>
	)
}

/** A candlestick chart: green bodies close up, red close down, wicks for the
 *  range, a volume strip beneath, price ticks and a last-price line. */
export function CandleChart({ candles, ticker }: {
	candles: Candle[]
	ticker: string
}) {
	if(!candles.length) {
		return (
			<p class='smx-candles-empty'>
				No trades yet for this range.
			</p>
		)
	}

	const rows = candles.map((c) => ({
		t: Date.parse(c.t),
		o: Number(c.o),
		h: Number(c.h),
		l: Number(c.l),
		c: Number(c.c),
		v: Number(c.v),
	}))
	const low = Math.min(...rows.map((r) => r.l))
	const high = Math.max(...rows.map((r) => r.h))
	const pad = (high - low || high || 1) * 0.1
	// Headroom under the lows keeps candles clear of the volume strip.
	const floor = low - pad - (high - low + pad * 2) * 0.28
	const span = high + pad - floor
	const maxVolume = Math.max(...rows.map((r) => r.v)) || 1
	const slot = 100 / rows.length
	const y = (price: number) => 100 - (price - floor) / span * 100
	const last = rows[rows.length - 1]
	const ticks = [1, 0.75, 0.5, 0.25, 0].map(
		(f) => formatUsdc(floor + span * f, 3),
	)
	const times = rows.map((r) => r.t)
	const labels = rows.length > 1
		? [times[0], times[Math.floor(times.length / 2)], times[times.length - 1]]
			.map((t) => DATE.format(t))
		: []

	return (
		<figure class='smx-candles'>
			<ChartPlot
				ticks={ticks}
				labels={labels}>
				<svg
					class='smx-candles__plot'
					viewBox='0 0 100 100'
					preserveAspectRatio='none'
					role='img'
					aria-label={`$${ticker} price candles`}>
					{
						rows.map((r, i) => {
							const centre = slot * i + slot / 2
							const width = slot * BODY_RATIO
							const top = y(Math.max(r.o, r.c))
							const bottom = y(Math.min(r.o, r.c))
							const dir = r.c >= r.o ? 'up' : 'down'
							return (
								<g
									class='smx-candles__candle'
									data-dir={dir}>
									<title safe>
										{`${DATE.format(r.t)} O ${r.o} H ${r.h} L ${r.l} C ${r.c}`}
									</title>
									<line
										class='smx-candles__wick'
										x1={centre.toFixed(3)}
										x2={centre.toFixed(3)}
										y1={y(r.h).toFixed(3)}
										y2={y(r.l).toFixed(3)} />
									<rect
										class='smx-candles__body'
										x={(centre - width / 2).toFixed(3)}
										width={width.toFixed(3)}
										y={top.toFixed(3)}
										height={Math.max(bottom - top, 0.4).toFixed(3)} />
								</g>
							)
						})
					}
					<line
						class='smx-candles__last'
						data-dir={last.c >= last.o ? 'up' : 'down'}
						x1='0'
						x2='100'
						y1={y(last.c).toFixed(3)}
						y2={y(last.c).toFixed(3)} />
				</svg>
				<output
					class='smx-candles__last-label'
					data-dir={last.c >= last.o ? 'up' : 'down'}
					style={`inset-block-start: ${y(last.c).toFixed(2)}%`}>
					{escapeText(formatUsdc(last.c, 3))}
				</output>
				<svg
					class='smx-candles__volume'
					viewBox='0 0 100 20'
					preserveAspectRatio='none'
					role='img'
					aria-label={`$${ticker} volume`}>
					{
						rows.map((r, i) => {
							const height = r.v / maxVolume * 20
							const width = slot * BODY_RATIO
							return (
								<rect
									data-dir={r.c >= r.o ? 'up' : 'down'}
									x={(slot * i + slot / 2 - width / 2).toFixed(3)}
									width={width.toFixed(3)}
									y={(20 - height).toFixed(3)}
									height={height.toFixed(3)} />
							)
						})
					}
				</svg>
			</ChartPlot>
		</figure>
	)
}

/** The swappable chart region: toolbar plus a line or candle plot. */
export function ChartRegion({ ticker, interval, mode, candles }: {
	ticker: string
	interval: ChartInterval
	mode: ChartMode
	candles: Candle[]
}) {
	return (
		<div
			id='smx-chart'
			class='smx-chart'>
			<ChartToolbar
				ticker={ticker}
				interval={interval}
				mode={mode} />
			{
				mode === 'line' && candles.length > 1
					? (
						<PriceChart
							title='Price'
							name={`$${ticker} price`}
							points={candles.map((c) => ({ at: c.t, price: c.c }))} />
					)
					: (
						<ChartFrame
							title='Price'
							kind='area'>
							<CandleChart
								candles={candles}
								ticker={ticker} />
						</ChartFrame>
					)
			}
		</div>
	)
}
