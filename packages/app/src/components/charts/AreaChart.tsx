import { ChartPlot } from './ChartPlot.tsx'

type Point = { label: string, value: number }

const TICKS = ['100%', '75%', '50%', '25%', '0%']

/** A percentage trend, drawn as a line over a soft fill. */
export function AreaChart({ name, points, labels }: {
	name: string
	points: Point[]
	labels: string[]
}) {
	const coordinates = points.map((point, index) => ({
		x: points.length > 1 ? index / (points.length - 1) * 100 : 50,
		y: 100 - point.value,
	}))
	const line = coordinates
		.map(({ x, y }, index) => `${index ? 'L' : 'M'}${x} ${y}`)
		.join(' ')

	return (
		<ChartPlot
			ticks={TICKS}
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
			<ol class='rc-area-chart__points'>
				{
					points.map((point, index) => (
						<li
							tabindex={0}
							style={
								`inset-inline-start: ${coordinates[index].x}%;`
								+ `inset-block-start: ${coordinates[index].y}%`
							}
							title={`${point.label}: ${point.value}%`}>
							<span
								class='rc-visually-hidden'
								safe>
								{`${point.label}: ${point.value}%`}
							</span>
						</li>
					))
				}
			</ol>
		</ChartPlot>
	)
}
