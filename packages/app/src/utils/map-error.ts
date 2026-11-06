import { badRequest, Boom, conflict } from '@hapi/boom'

/** Matches a "STATUS: message" prefix on plain-string errors so callers
 * can throw for example, `"404: Not found"` and still get a proper Boom out. */
const ERR_W_STATUS_REGEX = /^([0-9]{3}): (.*)$/

/** Coerce an unknown thrown value into a Boom for RFC-9457 error rendering. */
export function mapError(err: unknown): Boom {
	if(err instanceof Boom) {
		return err
	}

	// Catch-all for Postgres/app SQL errors (H0<status> SQLSTATEs, unique/FK
	// violations, …): map to the right HTTP status + the DB's own message, so a
	// raw thrown pg error becomes a proper 4xx here instead of a 500. A route
	// that wants custom copy still pre-maps with `mapPgError(err, hints)` (that
	// returns a Boom, handled above); this only covers what reaches the handler
	// unmapped.
	const pgError = mapPgError(err)
	if(pgError) {
		return pgError
	}

	if(err instanceof DOMException && err.name === 'TimeoutError') {
		return new Boom(err.message || 'Timed Out', {
			statusCode: 408,
			data: { err },
		})
	}

	if(err instanceof Error) {
		const e = err as Error & { status?: number, statusCode?: number }
		const status = e.status ?? e.statusCode
		if(typeof status === 'number' && status >= 400 && status < 600) {
			return new Boom(err, { statusCode: status })
		}

		return new Boom(err)
	}

	const message = String(
		err && typeof err === 'object' && 'message' in err ? err.message : err,
	)
	const statusMatch = message.match(ERR_W_STATUS_REGEX)
	if(statusMatch) {
		return new Boom(statusMatch[2], { statusCode: Number(statusMatch[1]) })
	}

	return new Boom(message)
}

/**
 * Per-route hints for `mapPgError`. Each field replaces the default
 * message for one Postgres errcode; omit to fall back to the DB's
 * own message (or a generic placeholder for codes that don't carry a
 * useful one). Routes only set the fields whose errors they actually
 * expect from the SQL function being called — anything unset means
 * "I don't expect this code from this call site; rethrow it as a 500
 * so we notice".
 */
export type PgErrorHints = {
	/** Message for `23505` unique_violation. */
	duplicate?: string
	/** Message for `23503` foreign_key_violation. Should name the
	 *  missing referenced entity, for example, "That organization does not
	 *  exist" — that's what the user typed and that's what's wrong. */
	missing?: string
	/** Message for `22023` invalid_parameter_value (for example, unparseable
	 *  semver from `parse_semver`). Defaults to the DB message. */
	invalid?: string
	/** Override for a specific errcode, keyed by the raw SQLSTATE (an
	 *  application `H0<status>` code, or `42501`). A string replaces the
	 *  message while keeping the status the code implies; a Boom is returned
	 *  as-is, so extra status/data can ride on it. */
	[code: string]: string | Boom | undefined
}

/**
 * Map a PG error to a Boom HTTP error. Application errors raised in SQL carry
 * their HTTP status in the SQLSTATE itself — `H0<status>` (for example, `H0409`
 * → 409, `H0429` → 429) — so the status needs no per-route lookup; a route only
 * supplies a nicer message (or a full Boom to attach extra data). Standard PG
 * codes map by convention (23503→400, 23505→409, 23514→409, 22023→400,
 * 42501→403). Returns null for unrecognised codes (→ 500 upstream).
 */
export function mapPgError(
	err: unknown,
	hints: PgErrorHints = {},
): Boom | null {
	const code = (err as { code?: string } | null)?.code
	if(!code) {
		return null
	}

	const msg = err instanceof Error ? err.message : String(err)
	// Did the calling route pass a custom message/response for THIS code?
	const hint = hints[code]

	// The route handed us a ready-made error — use it exactly as given.
	if(hint instanceof Boom) {
		return hint
	}

	// Our own errors: the code IS the HTTP status ("H0409" → 409). Use the
	// route's message if it gave one, otherwise the database's message.
	if(/^H0\d{3}$/.test(code)) {
		return new Boom(hint ?? msg, { statusCode: Number(code.slice(2)) })
	}

	// Errors Postgres itself raises: turn each one into the usual HTTP status.
	// Anything we don't list falls through to null → a 500, so we notice it.
	switch (code) {
		case '23503':
			return badRequest(hints.missing ?? 'Referenced resource does not exist')
		case '23505':
			return conflict(hints.duplicate ?? 'Duplicate entry')
		case '23514':
			return conflict(msg)
		case '22023':
			return badRequest(hints.invalid ?? msg)
		case '42501':
			return new Boom(hint ?? 'Insufficient privilege', { statusCode: 403 })
		default:
			return null
	}
}
