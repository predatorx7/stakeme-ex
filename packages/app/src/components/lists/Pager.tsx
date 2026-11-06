/** Id of the element rows are appended to; `Pager` targets it. */
export const LIST_BODY_ID = 'list-body'
const PAGER_ID = 'list-pager'

/**
 * Pagination for a keyset list. "Load more" is a real link to the next page
 * (`?cursor=`), so it works without JavaScript; with htmx it appends the next
 * rows to `#list-body`, swaps this nav and pushes the URL. "Newest" returns to
 * the first page and shows only when the page was opened at a cursor. The nav
 * is always rendered so the swap has a target; it is hidden when empty.
 */
export function Pager({ nextHref, firstHref }: {
	/** URL of the next page, or undefined on the last page. */
	nextHref?: string
	/** URL of the first page, or undefined when already on it. */
	firstHref?: string
}) {
	return (
		<nav
			id={PAGER_ID}
			class='rc-pagination smx-pager'
			aria-label='Pagination'
			hidden={!nextHref && !firstHref}>
			{
				!!firstHref && (
					<a
						class='rc-button'
						href={firstHref}>
						Newest
					</a>
				)
			}
			{
				!!nextHref && (
					<a
						class='rc-button'
						data-variant='primary'
						href={nextHref}
						rel='next'
						hx-get={nextHref}
						hx-target={`#${LIST_BODY_ID}`}
						hx-select={`#${LIST_BODY_ID} > *`}
						hx-select-oob={`#${PAGER_ID}`}
						hx-swap='beforeend'
						hx-push-url='true'>
						Load more
					</a>
				)
			}
		</nav>
	)
}
