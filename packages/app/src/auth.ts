import { unauthorized } from '@hapi/boom'
import { fromNodeHeaders } from 'better-auth/node'
import type { Request } from 'express'
import assert from 'node:assert'
import type { IAuthenticatedUser } from './types/index.ts'
import { resolveViewerById } from './queries.ts'

/**
 * Resolves the current viewer from a Better Auth session (cookie or bearer
 * token). Both carry the user's id, which IS `smx.users.id`. Best-effort:
 * returns undefined when there is no valid credential.
 */
export async function resolveViewer(
	req: Request,
): Promise<IAuthenticatedUser | undefined> {
	if(req.authMetadata) {
		return req.authMetadata
	}

	const session = await req.auth.api.getSession({
		headers: fromNodeHeaders(req.headers),
	})
	const userId = session?.user?.id
	if(!userId) {
		return
	}

	const [row] = await resolveViewerById.run({ id: userId }, req.pg)
	if(!row?.id) {
		return
	}

	const viewer: IAuthenticatedUser = {
		id: row.id,
		email: row.email,
		name: row.name,
		walletAddress: row.wallet_address,
	}
	req.authMetadata = viewer
	return viewer
}

/** Copies Set-Cookie header(s) from a fetch `Headers` onto the Express
 *  response. `getSetCookie()` keeps multiple cookies distinct; a single
 *  `get('set-cookie')` joins them with ", " and corrupts the session cookie. */
export function relaySetCookies(
	req: Pick<Request, 'res'>, headers: Headers,
) {
	const cookies = headers.getSetCookie()
	if(cookies.length) {
		req.res!.setHeader('Set-Cookie', cookies)
	}
}

/** Requires a signed-in viewer (resolved by the request-level middleware).
 *  Synchronous: a bare assert. */
export function requireAuth(
	req: Request,
	customMessage = 'Sign in to continue',
) {
	assert(req.authMetadata, unauthorized(customMessage))
}
