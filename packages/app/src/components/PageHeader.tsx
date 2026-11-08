import { type Children, escapeHtml } from '@kitajs/html'
import { markup } from '../utils/escape.ts'
import { Avatar } from './Avatar.tsx'

/** The heading block at the top of a console page. */
export function PageHeader({
	eyebrow,
	title,
	avatar,
	coinSource,
	meta,
	titleAside,
	lede,
	actions,
}: {
	eyebrow?: string
	title: string
	/** Id to show a generated avatar beside the title. */
	avatar?: string
	/** Marks the avatar as the coin trail origin. */
	coinSource?: boolean
	/** A kind tag and a line of facts under the title. */
	meta?: Children
	/** Rendered beside the title, outside the `<h1>`. */
	titleAside?: Children
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
				<div class={titleAside ? 'smx-title-row' : undefined}>
					<h1 class={avatar ? 'rc-page-header__title' : undefined}>
						{
							!!avatar && (
								<Avatar
									seed={avatar}
									coinSource={coinSource}
									size='lg' />
							)
						}
						{escapeHtml(title)}
					</h1>
					{!!titleAside && markup(titleAside)}
				</div>
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
