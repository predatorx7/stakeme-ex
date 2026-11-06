/**
 * Navigation by swapping the page shell. The nav fetches the destination and
 * replaces `#page-shell`, which keeps scroll, focus, open dialogs, and live
 * connections that a full page load would drop. `hx-select` takes the shell
 * from the full document, so every route keeps rendering `<Layout>`, and the
 * links keep their `href` for modified clicks, crawlers, and no-JavaScript
 * browsers. htmx also applies the response's `<title>`.
 *
 * This file has no imports because `client/behaviors.ts` bundles it for the
 * browser.
 */

/** Id of the swapped container — see `Layout.tsx`. */
export const PAGE_SHELL_ID = 'page-shell'

/**
 * Spread onto a nav link alongside its own `hx-get`. Don't use it for pages
 * that render outside `<Layout>`, such as `/docs`, because they have no shell
 * to select.
 * `show:window:top` scrolls to the top, as a real navigation does.
 */
export const NAV_SWAP = {
	'hx-target': `#${PAGE_SHELL_ID}`,
	'hx-select': `#${PAGE_SHELL_ID}`,
	'hx-swap': 'outerHTML show:window:top',
	'hx-push-url': 'true',
} as const

/** A nav link that navigates by swapping the page shell. */
export const navLink = (href: string) => ({
	href,
	'hx-get': href,
	...NAV_SWAP,
})
