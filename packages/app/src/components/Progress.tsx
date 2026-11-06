import { escapeHtml } from '@kitajs/html'

type Tone = 'warning' | 'danger'

/** A labelled bar for a value out of 100. */
export function LinearProgress({ value, label, valueLabel, note, tone }: {
	value: number
	label: string
	valueLabel: string
	note?: string
	tone?: Tone
}) {
	return (
		<div class='rc-progress-wrap'>
			<span>
				<span>
					{escapeHtml(label)}
				</span>
				<span>
					{escapeHtml(valueLabel)}
				</span>
			</span>
			<div
				class='rc-progress'
				role='progressbar'
				aria-label={label}
				aria-valuemin='0'
				aria-valuemax='100'
				aria-valuenow={value}
				data-tone={tone}
				style={`--rc-progress-value: ${value}%`}>
				<span />
			</div>
			{
				!!note && (
					<small>
						{escapeHtml(note)}
					</small>
				)
			}
		</div>
	)
}

/** A ring for a value out of 100, with the figure inside. */
export function CircularProgress({ value, label, sublabel, tone }: {
	value: number
	label: string
	sublabel?: string
	tone?: Tone
}) {
	return (
		<div
			class='rc-circular-progress'
			role='progressbar'
			aria-label={`${label}${sublabel ?? ''}`}
			aria-valuemin='0'
			aria-valuemax='100'
			aria-valuenow={value}
			data-tone={tone}
			style={`--_progress-value-number: ${value}`}>
			<svg
				viewBox='0 0 44 44'
				aria-hidden='true'>
				<circle
					class='rc-circular-progress__track'
					cx='22'
					cy='22'
					r='19' />
				<circle
					class='rc-circular-progress__value'
					cx='22'
					cy='22'
					r='19'
					pathLength='100' />
			</svg>
			<span>
				{escapeHtml(label)}
				{
					!!sublabel && (
						<small>
							{escapeHtml(sublabel)}
						</small>
					)
				}
			</span>
		</div>
	)
}
