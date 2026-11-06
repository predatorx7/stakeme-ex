import { demoAdvanceDeadline } from '../queries.ts'
import type { ITypedExpressRequest } from '../types/openapi.ts'
import { assertDemoPresenter } from '../utils/demo-gate.ts'

/**
 * `POST /demo/creators/{ticker}/advance-deadline` — puts the next proof
 * deadline in the past so the freeze path can be shown. Presenter only.
 */
export default async function DemoAdvanceDeadlineRoute(
	req: ITypedExpressRequest<'DemoAdvanceDeadline'>,
) {
	assertDemoPresenter(req)
	const { ticker } = req.params
	await demoAdvanceDeadline.run({ ticker }, req.pg)
	req.res!.status(201).json({
		ok: true,
		message: 'Proof deadline moved into the past.',
		next: `/creators/${ticker}`,
	})
}
