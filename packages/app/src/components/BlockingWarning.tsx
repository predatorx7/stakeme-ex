import { type Children, escapeHtml } from '@kitajs/html'
import { markup } from '../utils/escape.ts'
import { Icon } from './Icon.tsx'

/** A bordered alert for something that stops the person from moving on, with
 *  an optional button or link to fix it. */
export function BlockingWarning({ title, children, action }: {
	title: string
	children: Children
	action?: Children
}) {
	return (
		<aside
			class='rc-blocking-warning'
			role='alert'>
			<Icon
				name='warning'
				class='rc-blocking-warning__icon' />
			<div class='rc-blocking-warning__body'>
				<strong>
					{escapeHtml(title)}
				</strong>
				<span>
					{typeof children === 'string' ? escapeHtml(children) : children}
				</span>
			</div>
			{
				action && (
					<div class='rc-blocking-warning__action'>
						{markup(action)}
					</div>
				)
			}
		</aside>
	)
}
