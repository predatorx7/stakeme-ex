import type { PropsWithChildren } from '@kitajs/html'
import { escapeText } from '../../utils/escape.ts'

/** Value ticks on the left of a plot and labels under it, over gridlines. */
export function ChartPlot({ ticks, labels, children }: PropsWithChildren<{
	/** Top to bottom. */
	ticks: string[]
	labels: string[]
}>) {
	return (
		<div class='rc-chart-plot'>
			<ol class='rc-chart-plot__ticks'>
				{
					ticks.map((tick) => (
						<li>
							{escapeText(tick)}
						</li>
					))
				}
			</ol>
			<div class='rc-chart-plot__area'>
				{children}
			</div>
			<ol class='rc-chart-plot__labels'>
				{
					labels.map((label) => (
						<li safe>
							{label}
						</li>
					))
				}
			</ol>
		</div>
	)
}
