import { forbidden } from '@hapi/boom'
import assert from 'node:assert'
import { DEMO_MODE } from '../consts.ts'
import { triggerDefault } from '../queries.ts'
import type { ITypedExpressRequest } from '../types/openapi.ts'

/** `POST /api/trigger-default` — demo only (`DEMO_MODE=1`). */
export default async function TriggerDefaultRoute(
	req: ITypedExpressRequest<'TriggerDefault'>,
) {
	assert(DEMO_MODE, forbidden('Triggering a default needs DEMO_MODE=1'))
	const [row] = await triggerDefault.run({ ticker: req.body.ticker }, req.pg)
	req.res!.status(201).json(row.j)
}
