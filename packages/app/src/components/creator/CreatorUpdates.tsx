import type { CreatorUpdate, CreatorUpdatesPage } from '../../types/index.ts'
import { formatDate } from '../../utils/dates.ts'
import { escapeText } from '../../utils/escape.ts'
import { withQueryParams } from '../../utils/http.ts'
import { EmptyState } from '../EmptyState.tsx'
import { LIST_BODY_ID, Pager } from '../lists/Pager.tsx'
import { ViewAll } from '../lists/ViewAll.tsx'
import { PageHeader } from '../PageHeader.tsx'
import { SectionCard } from '../SectionCard.tsx'

/** Updates shown on the token page before "View all". */
export const LATEST_UPDATES = 5

/** The text after "https://" with the path trimmed, for the link label. */
function linkLabel(link: string) {
	return link.replace(/^https:\/\//, '').replace(/\/$/, '')
}

function UpdateRow({ u }: { u: CreatorUpdate }) {
	return (
		<li class='smx-update'>
			<time datetime={u.createdAt}>
				{escapeText(formatDate(u.createdAt))}
			</time>
			<p>
				{escapeText(u.body)}
			</p>
			{
				u.link?.startsWith('https://') && (
					<a
						href={u.link}
						target='_blank'
						rel='noopener nofollow ugc'>
						{escapeText(linkLabel(u.link))}
					</a>
				)
			}
		</li>
	)
}

/**
 * The latest updates a creator posted to holders, newest first, with "View all"
 * when there are more. Drop it on the token page with `page.updates` and
 * `page.more?.updates`. Update text is plain: it is escaped, never parsed.
 */
export function CreatorUpdates({ ticker, items, hasMore }: {
	ticker: string
	items: CreatorUpdate[]
	/** True when the full list holds more than `items`. */
	hasMore?: boolean
}) {
	return (
		<SectionCard
			id='creator-updates'
			title='Updates'
			meta={
				hasMore && (
					<ViewAll
						href={`/creators/${ticker}/updates`}
						label='updates' />
				)
			}>
			{
				items.length === 0
					? (
						<EmptyState
							title='No updates yet'
							hint='Posts from the creator show up here.' />
					)
					: (
						<ul class='smx-updates'>
							{items.slice(0, LATEST_UPDATES).map((u) => <UpdateRow u={u} />)}
						</ul>
					)
			}
		</SectionCard>
	)
}

/** `GET /creators/{ticker}/updates`: every update, paged. */
export function CreatorUpdatesListPage(props: CreatorUpdatesPage & {
	cursor?: string
	/** The request URL, so page links keep the cursor. */
	url: string
}) {
	const { creator: c, items, url } = props
	return (
		<div class='smx-page'>
			<PageHeader
				eyebrow={`$${c.ticker}`}
				title='Updates'
				lede={c.displayName}
				actions={
					<a
						class='rc-button'
						href={`/creators/${c.ticker}`}>
						{escapeText(`Back to $${c.ticker}`)}
					</a>
				} />
			<SectionCard title='Updates'>
				{
					items.length === 0
						? (
							<EmptyState
								title='No updates yet'
								hint='Posts from the creator show up here.' />
						)
						: (
							<ul
								id={LIST_BODY_ID}
								class='smx-updates'>
								{items.map((u) => <UpdateRow u={u} />)}
							</ul>
						)
				}
			</SectionCard>
			<Pager
				nextHref={
					props.nextPageCursor
						? withQueryParams(url, { cursor: props.nextPageCursor })
						: undefined
				}
				firstHref={
					props.cursor
						? withQueryParams(url, { cursor: undefined })
						: undefined
				} />
		</div>
	)
}
