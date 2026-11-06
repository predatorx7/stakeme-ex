import { escapeHtml } from '@kitajs/html'

/** A headline figure with a note under it. Place several in `.rc-kpi-grid`. */
export function Kpi({ label, value, note }: {
	label: string
	value: string
	note: string
}) {
	return (
		<article class='rc-kpi'>
			<span class='rc-kpi__label'>
				{escapeHtml(label)}
			</span>
			<strong class='rc-kpi__value'>
				{escapeHtml(value)}
			</strong>
			<span class='rc-kpi__delta'>
				{escapeHtml(note)}
			</span>
		</article>
	)
}
