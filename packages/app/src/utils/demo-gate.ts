import { forbidden } from '@hapi/boom'
import type { Request } from 'express'
import assert from 'node:assert'
import { timingSafeEqual } from 'node:crypto'
import { DEMO_MODE, demoPresenterWallets, smxAdminKey } from '../consts.ts'

/** Constant-time string compare (hashes the length away via padding). */
export function safeEqual(a: string, b: string) {
	const ba = Buffer.from(a)
	const bb = Buffer.from(b)
	const len = Math.max(ba.length, bb.length, 1)
	const pa = Buffer.alloc(len)
	const pb = Buffer.alloc(len)
	ba.copy(pa)
	bb.copy(pb)
	return timingSafeEqual(pa, pb) && ba.length === bb.length
}

/**
 * Demo helper gate: `DEMO_MODE=1` AND (the signed-in wallet is in
 * `DEMO_PRESENTER_WALLETS` OR `X-Admin-Key` equals `SMX_ADMIN_KEY`). Else 403.
 */
export function assertDemoPresenter(
	req: Pick<Request, 'headers' | 'authMetadata'>,
) {
	assert(DEMO_MODE, forbidden('Demo helpers need DEMO_MODE=1'))
	const key = smxAdminKey()
	const sent = req.headers['x-admin-key']
	const wallet = req.authMetadata?.walletAddress?.toLowerCase()
	const isAdmin = !!key && typeof sent === 'string' && safeEqual(sent, key)
	const isPresenter = !!wallet && demoPresenterWallets().includes(wallet)
	assert(isAdmin || isPresenter, forbidden('Presenter wallet required'))
}
