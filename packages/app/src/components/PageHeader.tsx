import { type Children, escapeHtml } from '@kitajs/html'
import { markup } from '../utils/escape.ts'

/** The heading block at the top of a console page. */
export function PageHeader({ eyebrow, title, meta, lede, actions }: {
	eyebrow?: string
	title: string
	/** A kind tag and a line of facts under the title. */
	meta?: Children
	lede?: string
	/** Buttons or links, right-aligned beside the title. */
	actions?: Children
}) {
	return (
		<header class='rc-page-header'>
			<div>
				{
					!!eyebrow && (
						<span class='rc-eyebrow'>
							{escapeHtml(eyebrow)}
						</span>
					)
				}
				<h1>
					{escapeHtml(title)}
				</h1>
				{
					meta && (
						<div class='rc-page-header__meta'>
							{markup(meta)}
						</div>
					)
				}
				{
					!!lede && (
						<p>
							{escapeHtml(lede)}
						</p>
					)
				}
			</div>
			{
				actions && (
					<div class='rc-page-header__actions'>
						{markup(actions)}
					</div>
				)
			}
		</header>
	)
}
