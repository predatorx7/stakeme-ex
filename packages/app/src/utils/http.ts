import type { Request, Response } from 'express'

// Re-exported from consts.ts so routes can import `canonicalOrigin` from here.
export { canonicalOrigin } from '../consts.ts'

/** Bump when the cursor encoding changes so old cursors are rejected
 *  instead of silently decoding to nonsense. */
const CURSOR_VERSION = 'v1'

/**
 * Encode a stable `(rank, updatedAt, id)` keyset as an opaque cursor for
 * list pagination. `updatedAt` is normalized to ISO so cursors are
 * comparable as strings server-side. `rank` is optional.
 *
 * @param updatedAt  Row's last-updated timestamp.
 * @param id         Row id — tie-breaker for rows sharing `updatedAt`.
 * @param rank       Optional rank for search results.
 * @returns          URL-safe (base64url) opaque token.
 */
export function encodeUpdatedCursor(
	updatedAt: Date | string,
	id: string,
	rank?: number,
) {
	const ts = updatedAt instanceof Date ? updatedAt.toISOString() : updatedAt
	return Buffer.from(`${CURSOR_VERSION}\n${ts}\n${id}\n${rank ?? ''}`).toString(
		'base64url',
	)
}

/**
 * Reverse `encodeUpdatedCursor`. Returns `null` for missing, malformed,
 * or version-mismatched cursors so callers can fall back to the first
 * page rather than 400-ing the request.
 *
 * @param cursor  Opaque token returned by `encodeUpdatedCursor`.
 */
export function decodeUpdatedCursor(cursor?: string) {
	if(!cursor) {
		return null
	}

	try {
		const parts = Buffer.from(cursor, 'base64url').toString('utf8').split('\n')
		const version = parts[0]

		if(version === 'v1') {
			const [, ts, id, rankStr] = parts
			if(!ts || !id) {
				return null
			}

			return {
				updatedAt: ts,
				id,
				rank: rankStr ? parseFloat(rankStr) : undefined,
			}
		}

		return null
	} catch{
		return null
	}
}

/**
 * Rebuild a request's path+query with some params changed. `undefined`/empty
 * values DELETE the param. Used by list pages to make every filter state a
 * shareable URL (changing a filter usually also drops `cursor`).
 */
export function withQueryParams(
	originalUrl: string,
	changes: Record<string, string | undefined>,
): string {
	const u = new URL(originalUrl, 'http://x')
	for(const [k, v] of Object.entries(changes)) {
		if(v === undefined || v === '') {
			u.searchParams.delete(k)
		} else {
			u.searchParams.set(k, v)
		}
	}

	return u.pathname + u.search
}

/**
 * Rebuild a request's path+query with a REPEATED param set to `values`
 * (`?tag=a&tag=b`). `withQueryParams` can't express this — it uses
 * `searchParams.set`, which collapses a param to one value — and OpenAPI
 * declares `tag` as `explode: true`, so the array has to travel as repeats.
 * Always drops `cursor`, since changing a filter invalidates the keyset page.
 */
export function withRepeatedQueryParam(
	originalUrl: string,
	key: string,
	values: string[],
): string {
	const u = new URL(originalUrl, 'http://x')
	u.searchParams.delete(key)
	for(const v of values) {
		u.searchParams.append(key, v)
	}

	u.searchParams.delete('cursor')
	return u.pathname + u.search
}

/**
 * Send a pre-serialized JSON string straight to the response — no re-encode.
 * Pairs with a query that casts its shape to `::text` (`... AS j`), so the
 * bytes Postgres built stream through untouched (no driver parse, no
 * `res.json` re-stringify). Only for pass-through routes that never read the
 * body; anything that inspects fields should take the parsed object +
 * `res.json`.
 */
export function sendJson(res: Response, body: string, status = 200) {
	res.status(status).type('application/json').send(body)
}

/**
 * Redirect both HTMX and plain callers with one handler: HTMX needs an
 * `HX-Redirect` header to navigate (a normal 3xx `Location` won't move it), so
 * an `HX-Request` gets a 204 + `HX-Redirect`; everyone else gets a normal
 * `Location` redirect, optionally with a JSON body for API callers.
 */
export function sendOrRedirect(
	req: { headers: Request['headers'] },
	res: Response,
	url: string,
	jsonPayload?: unknown,
	status = 200,
) {
	if(req.headers['hx-request']) {
		res.setHeader('HX-Redirect', url)
		res.status(204).end()
		return
	}

	const finalRes = res.status(status).setHeader('Location', url)
	if(jsonPayload !== undefined) {
		finalRes.json(jsonPayload)
	} else {
		finalRes.end()
	}
}
