import { type Children, escapeHtml } from '@kitajs/html'
import { markup } from '../utils/escape.ts'
import { Icon } from './Icon.tsx'

/** A dashed note that points at what to do or what happened. */
export function Hint({ title, children }: {
	title: string
	children?: Children
}) {
	return (
		<aside class='rc-hint'>
			<Icon name='sparkle' />
			<div>
				<strong>
					{escapeHtml(title)}
				</strong>
				{
					!!children && (
						<p>
							{markup(children)}
						</p>
					)
				}
			</div>
		</aside>
	)
}
