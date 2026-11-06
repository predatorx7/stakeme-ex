import type { PricePoint } from '../../types/index.ts'
import { formatUsdc } from '../../utils/money.ts'
import { ChartFrame } from './ChartFrame.tsx'
import { ChartPlot } from './ChartPlot.tsx'

const SHORT = new Intl.DateTimeFormat('en-US', {
	month: 'short',
	day: 'numeric',
	timeZone: 'UTC',
})

/** A price history as an area chart framed in a card, with price ticks. */
export function PriceChart({ title, name, points }: {
	title: string
	name: string
	points: PricePoint[]
}) {
	const values = points.map((p) => Number(p.price))
	const low = Math.min(...values)
	const high = Math.max(...values)
	const pad = (high - low || high || 1) * 0.1
	const floor = low - pad
	const span = high + pad - floor
	const xy = values.map((v, i) => ({
		x: values.length > 1 ? i / (values.length - 1) * 100 : 50,
		y: 100 - (v - floor) / span * 100,
	}))
	const line = xy
		.map(({ x, y }, i) => `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`)
		.join(' ')
	const ticks = [1, 0.75, 0.5, 0.25, 0].map(
		(f) => formatUsdc(floor + span * f, 3),
	)
	const times = points.map((p) => Date.parse(p.at))
	const labels = points.length > 1
		? [times[0], times[Math.floor(times.length / 2)], times[times.length - 1]]
			.map((t) => SHORT.format(t))
		: []

	return (
		<ChartFrame
			title={title}
			kind='area'>
			<ChartPlot
				ticks={ticks}
				labels={labels}>
				<svg
					class='rc-area-chart'
					viewBox='0 0 100 100'
					preserveAspectRatio='none'
					role='img'
					aria-label={name}>
					<path
						class='rc-area-chart__fill'
						d={`${line} L100 100 L0 100 Z`} />
					<path
						class='rc-area-chart__line'
						d={line} />
				</svg>
			</ChartPlot>
		</ChartFrame>
	)
}
