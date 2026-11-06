import { type Children, escapeHtml } from '@kitajs/html'
import { escapeText, markup } from '../utils/escape.ts'

/**
 * A `SectionCard` that folds, on the design package's `details.rc-expansion`
 * tile. The header (title, count, context) toggles the body, which holds the
 * actions, the content and the footer. Actions stay out of the header so a
 * button never nests inside the `summary` toggle. Collapsed by default; a link
 * to `#id` opens it (`client/behaviors.ts`).
 */
export function ExpandableCard(
	{ id, title, count, context, trail, actions, footer, children }: {
		id: string
		title: string
		count?: number
		/** A short sentence under the title, visible while collapsed. */
		context?: string
		/** A short status at the end of the header, such as a badge; in place
		 *  of `count`. */
		trail?: Children
		/** Buttons at the top of the opened body. */
		actions?: Children
		footer?: Children
		children?: Children
	},
) {
	return (
		<details
			id={id}
			class='rc-expansion expandable-card'>
			<summary>
				<span>
					<strong>
						{escapeHtml(title)}
					</strong>
					{
						!!context && (
							<small>
								{escapeHtml(context)}
							</small>
						)
					}
				</span>
				{
					count !== undefined && (
						<span class='rc-expansion__trail'>
							<span class='rc-count'>
								{escapeText(count.toLocaleString('en-US'))}
							</span>
						</span>
					)
				}
				{
					!!trail && (
						<span class='rc-expansion__trail'>
							{markup(trail)}
						</span>
					)
				}
			</summary>
			<div class='rc-expansion__body'>
				{
					actions && (
						<div class='rc-cluster expandable-card__actions'>
							{markup(actions)}
						</div>
					)
				}
				{children}
				{
					footer && (
						<footer class='rc-field__hint'>
							{markup(footer)}
						</footer>
					)
				}
			</div>
		</details>
	)
}
