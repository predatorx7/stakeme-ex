import { OUTCOMES } from './segments.ts'

/** Names the outcome colors the bar charts share. */
export function OutcomeLegend() {
	return (
		<span class='rc-chart-legend'>
			{
				OUTCOMES.map(({ key, tone }) => (
					<span data-tone={tone}>
						{key}
					</span>
				))
			}
		</span>
	)
}
