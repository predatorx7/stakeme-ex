import type { IncomingHttpHeaders } from 'node:http'

/**
 * Content negotiation for routes that serve either an HTML page or JSON from
 * one handler. A machine caller gets JSON; a browser gets the page.
 *
 * - HTMX drives HTML swaps and sets no `Accept` (its XHR defaults to the
 *   accept-anything wildcard), so it's detected by its `HX-Request` header and
 *   always gets HTML.
 * - Otherwise JSON when the caller states no HTML preference: no `Accept`, an
 *   explicit `application/json`, or the bare accept-anything wildcard (curl,
 *   fetch, most API clients).
 * - A browser document request sends `text/html`, so it gets the page.
 */
export function shouldSendJson(
	req: { headers: { accept?: string, 'hx-request'?: string } },
) {
	// Load-bearing: htmx sends the accept-anything wildcard, which the check
	// below reads as "JSON is fine". Without this line every htmx swap — the
	// nav swaps included — would be answered with a JSON body.
	if(req.headers['hx-request']) {
		return false
	}

	const a = req.headers.accept?.trim()
	return !a || a === '*/*' || a.includes('application/json')
}

/**
 * Whether this request wants a bare HTML FRAGMENT rather than a whole page.
 *
 * Opt-in by design. Fragment triggers (live-search parents, filters) declare
 * `hx-headers='{"HX-Fragment":"1"}'`; everything else, including the header's
 * `#page-shell` nav swaps and htmx's history-restore requests, gets the
 * full page.
 *
 * Sniffing `HX-Request` instead does not work: it is set by EVERY htmx request,
 * so a nav swap to `/` would receive the results list with no page shell in it
 * and blank the page. That is also why the old `hx-history-restore-request`
 * exception existed; with an explicit marker it is unnecessary.
 */
export function wantsFragment(req: { headers: IncomingHttpHeaders }) {
	return req.headers['hx-fragment'] === '1'
}
