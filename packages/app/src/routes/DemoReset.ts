import { demoResetCreator } from '../queries.ts'
import type { ITypedExpressRequest } from '../types/openapi.ts'
import { assertDemoPresenter } from '../utils/demo-gate.ts'

/**
 * `POST /demo/reset` — deletes the reserved creator and all its rows, frees
 * the World ID nullifier and bumps the demo epoch (fresh onchain nullifier
 * hash for the next IPO). Presenter only, `DEMO_MODE=1` only.
 */
export default async function DemoResetRoute(
	req: ITypedExpressRequest<'DemoReset'>,
) {
	assertDemoPresenter(req)
	const { ticker } = req.body
	const [row] = await demoResetCreator.run({ ticker }, req.pg)
	req.res!.status(201).json({
		ok: true,
		message: `${ticker} reset (epoch ${row.epoch}). Launch it again.`,
		next: '/launch',
	})
}
