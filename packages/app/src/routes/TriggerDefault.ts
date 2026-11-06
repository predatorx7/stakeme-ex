import { forbidden } from '@hapi/boom'
import assert from 'node:assert'
import { timingSafeEqual } from 'node:crypto'
import { DEMO_MODE, smxAdminKey } from '../consts.ts'
import { triggerDefault } from '../queries.ts'
import type { ITypedExpressRequest } from '../types/openapi.ts'

/** Constant-time string compare (hashes the length away via padding). */
function safeEqual(a: string, b: string) {
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
 * `POST /api/trigger-default` — demo only (`DEMO_MODE=1`) and admin only:
 * needs an `X-Admin-Key` header equal to `SMX_ADMIN_KEY` (unset disables it).
 */
export default async function TriggerDefaultRoute(
	req: ITypedExpressRequest<'TriggerDefault'>,
) {
	assert(DEMO_MODE, forbidden('Triggering a default needs DEMO_MODE=1'))
	const key = smxAdminKey()
	const sent = req.headers['x-admin-key']
	assert(
		key && typeof sent === 'string' && safeEqual(sent, key),
		forbidden('Admin key required'),
	)
	const [row] = await triggerDefault.run({ ticker: req.body.ticker }, req.pg)
	req.res!.status(201).json(row.j)
}
