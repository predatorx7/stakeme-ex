import { randomBytes } from 'node:crypto'
import type { MockBank } from '../types/index.ts'

/**
 * Mock bank (simulates HDFC) for the Reclaim provider. Reclaim's attestor must
 * prove an auth-bound request, so the statement API needs a session cookie.
 * Any non-empty username and password is accepted. Sessions live in memory
 * (demo only): a restart logs everyone out.
 */
export const BANK_COOKIE = 'smx_bank_session'
const SESSION_TTL_MS = 12 * 60 * 60 * 1000
const MAX_SESSIONS = 1000
const SESSIONS = new Map<string, { holderName: string, expiresAt: number }>()

/** Creates a session for `username` and returns its opaque token. */
export function createBankSession(username: string) {
	const now = Date.now()
	for(const [token, s] of SESSIONS) {
		if(s.expiresAt < now || SESSIONS.size > MAX_SESSIONS) {
			SESSIONS.delete(token)
		}
	}

	const token = randomBytes(24).toString('base64url')
	SESSIONS.set(token, {
		holderName: username.trim().slice(0, 60) || 'Demo Customer',
		expiresAt: now + SESSION_TTL_MS,
	})
	return token
}

/** Returns the session for the request's cookie header, if still valid. */
export function getBankSession(cookieHeader: string | undefined) {
	const token = cookieHeader
		?.split(';')
		.map((c) => c.trim().split('='))
		.find(([name]) => name === BANK_COOKIE)?.[1]
	const session = token ? SESSIONS.get(token) : undefined
	if(!session || session.expiresAt < Date.now()) {
		return undefined
	}

	return session
}

/** The fixed statement: $5,000.00 "Acme Studio freelance income" today. */
export function buildStatement(holderName: string): MockBank {
	const today = new Date().toISOString().slice(0, 10)
	// The withdrawal is dated a day earlier so the deposit's date is unique in
	// the response: the Reclaim provider proves the deposit date by value.
	const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
	return {
		account: 'Savings Account XXXX4242',
		holderName,
		balance: '12957.50',
		transactions: [
			{
				id: 'txn_0001',
				date: today,
				description: 'Acme Studio freelance income',
				amount: '5000.00',
				type: 'DEPOSIT',
			},
			{
				id: 'txn_0002',
				date: yesterday,
				description: 'Cloud hosting',
				amount: '42.50',
				type: 'WITHDRAWAL',
			},
		],
	}
}
