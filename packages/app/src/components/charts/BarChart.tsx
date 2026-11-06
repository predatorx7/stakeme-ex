import { navLink } from '../nav-swap.ts'
import { ChartPlot } from './ChartPlot.tsx'
import { type Segment, segmentsTitle, total } from './segments.ts'

type Bar = {
	label: string
	segments: Segment[]
	/** Makes the bar a link, such as to that day's sessions. */
	href?: string
}

const INTERVALS = 4

/** Vertical stacked bars, one per label. */
export function BarChart({ name, bars, labels }: {
	name: string
	bars: Bar[]
	/** Axis labels spread evenly under the plot. */
	labels: string[]
}) {
	const top = niceStep(Math.max(
		INTERVALS,
		...bars.map((bar) => total(bar.segments)),
	) / INTERVALS) * INTERVALS
	const ticks = Array.from(
		{ length: INTERVALS + 1 },
		(_, index) => (top - top / INTERVALS * index).toLocaleString('en-US'),
	)

	return (
		<ChartPlot
			ticks={ticks}
			labels={labels}>
			<ol
				class='rc-bar-chart'
				aria-label={name}>
				{
					bars.map((bar) => {
						const title = segmentsTitle(bar.label, bar.segments)
						const content = (
							<>
								<span
									class='rc-visually-hidden'
									safe>
									{title}
								</span>
								{
									bar.segments
										.filter((segment) => segment.value > 0)
										.map((segment) => (
											<span
												data-tone={segment.tone}
												style={`block-size: ${segment.value / top * 100}%`} />
										))
								}
							</>
						)
						return bar.href
							? (
								<li title={title}>
									<a {...navLink(bar.href)}>
										{content}
									</a>
								</li>
							)
							: (
								<li
									tabindex={0}
									title={title}>
									{content}
								</li>
							)
					})
				}
			</ol>
		</ChartPlot>
	)
}

/** The smallest 1, 2 or 5 times a power of ten that is at least `value`. */
function niceStep(value: number) {
	const magnitude = 10 ** Math.floor(Math.log10(value))
	return [1, 2, 5, 10].map((step) => step * magnitude)
		.find((step) => step >= value) ?? magnitude * 10
}
