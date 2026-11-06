import { type Children, escapeHtml } from '@kitajs/html'
import { markup } from '../utils/escape.ts'

/** One step of a numbered flow, such as the build page. */
export function NumberedStep({ number, title, description, action, children }: {
	number: number
	title: string
	description?: string
	/** The button or link that completes the step. */
	action?: Children
	children?: Children
}) {
	return (
		<section class='rc-numbered-step'>
			<span
				class='rc-numbered-step__number'
				aria-hidden='true'>
				{number}
			</span>
			<div>
				<h2>
					{escapeHtml(title)}
				</h2>
				{
					!!description && (
						<p>
							{escapeHtml(description)}
						</p>
					)
				}
				{children}
				{
					action && (
						<div class='rc-numbered-step__action'>
							{markup(action)}
						</div>
					)
				}
			</div>
		</section>
	)
}
