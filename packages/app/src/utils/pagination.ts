import { badRequest } from '@hapi/boom'
import assert from 'node:assert'
import { decodeUpdatedCursor, encodeUpdatedCursor } from './http.ts'

/** Rows per page on `GET /creators` and the creator sub-lists. */
export const LIST_PAGE_SIZE = 25
/** Rows per page on `GET /activity`. */
export const ACTIVITY_PAGE_SIZE = 50

type SqlNext = { key: string, id: string } | null

/**
 * The keyset the SQL page functions take (`after_key`, `after_id`), from the
 * opaque `cursor` query param. A missing or malformed cursor is the first
 * page. The cursor's "timestamp" slot carries the page's sort key as text.
 */
export function cursorParams(cursor?: string) {
	const decoded = decodeUpdatedCursor(cursor)
	return {
		after_key: decoded?.updatedAt ?? null,
		after_id: decoded?.id ?? null,
	}
}

/**
 * Turns a SQL page document (`items` plus `next`) into the API shape, where
 * `next` becomes the opaque `nextPageCursor` (absent on the last page).
 */
export function toPage<T>(doc: unknown) {
	const { next, ...rest } = doc as T & { next?: SqlNext }
	return {
		...rest,
		nextPageCursor: next ? encodeUpdatedCursor(next.key, next.id) : undefined,
	}
}

/**
 * Runs a page query, answering a cursor Postgres can't parse (a forged or
 * stale one) with 400 instead of 500.
 */
export async function pageQuery<T>(run: Promise<T>) {
	try {
		return await run
	} catch(err) {
		// SQLSTATE class 22: data exception (bad cast of the cursor's key).
		const code = (err as { code?: unknown } | null)?.code
		const bad = typeof code === 'string' && code.startsWith('22')
		assert(!bad, badRequest('Invalid cursor'))
		throw err
	}
}
