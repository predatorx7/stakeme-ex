import { type Children, escapeHtml } from '@kitajs/html'
import { escapeText, markup } from '../utils/escape.ts'

/**
 * A titled card, the app's one card pattern. Tables and list rows go straight
 * in as children and run edge to edge.
 */
export function SectionCard(
	{
		id,
		title,
		level = 'h2',
		count,
		context,
		meta,
		footer,
		tile,
		plain,
		children,
	}: {
		id?: string
		title: string
		/** Heading level; `h3` for a card that sits under a section heading. */
		level?: 'h2' | 'h3'
		count?: number
		/** A short sentence next to the title. */
		context?: string
		/** Short text or a link at the end of the header. */
		meta?: Children
		footer?: Children
		/** Drops the header divider, for a card whose body is text or a form
		 *  rather than a table or list. */
		plain?: boolean
		/** Adds the pointer glow. */
		tile?: boolean
		children?: Children
	}) {
	const Heading = level
	return (
		<section
			id={id}
			class='rc-card'
			data-tile={tile ? '' : undefined}>
			<header
				class='rc-card__header'
				data-variant={plain ? 'plain' : undefined}>
				<Heading>
					{escapeHtml(title)}
				</Heading>
				{
					count !== undefined && (
						<span class='rc-count'>
							{escapeText(count.toLocaleString('en-US'))}
						</span>
					)
				}
				{
					!!context && (
						<p>
							{escapeHtml(context)}
						</p>
					)
				}
				{
					meta && (
						<span class='rc-card__meta'>
							{markup(meta)}
						</span>
					)
				}
			</header>
			{children}
			{
				footer && (
					<footer class='rc-card__footer'>
						{markup(footer)}
					</footer>
				)
			}
		</section>
	)
}
