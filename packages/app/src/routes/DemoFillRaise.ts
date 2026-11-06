import { privateKeyToAccount } from 'viem/accounts'
import { ORACLE_PRIVATE_KEY } from '../consts.ts'
import { isChainConfigured } from '../integrations/chain.ts'
import { demoFillRaise } from '../queries.ts'
import type { ITypedExpressRequest } from '../types/openapi.ts'
import { assertDemoPresenter } from '../utils/demo-gate.ts'

/** Investor of record in simulated chain mode. */
const SIM_INVESTOR = '0x00000000000000000000000000000000000d3a01'

/**
 * `POST /demo/creators/{ticker}/fill-raise` — invests the remaining raise as
 * the oracle wallet. The `invest` chain job (mint, approve, invest) is sent by
 * the worker in order, so the oracle key has one signer. Filling closes the
 * raise: tranche 0 releases and the pool seeds. Presenter only.
 */
export default async function DemoFillRaiseRoute(
	req: ITypedExpressRequest<'DemoFillRaise'>,
) {
	assertDemoPresenter(req)
	const { ticker } = req.params
	const wallet = isChainConfigured() && ORACLE_PRIVATE_KEY
		// Cast: env value is a 0x-prefixed private key.
		? privateKeyToAccount(ORACLE_PRIVATE_KEY as `0x${string}`).address
		: SIM_INVESTOR
	const [row] = await demoFillRaise.run({ ticker, wallet }, req.pg)
	req.res!.status(201).json({
		ok: true,
		message: row.closed
			? `Raise filled (${row.raised} USDC). Tranche 0 released.`
			: `Raised ${row.raised} USDC.`,
		next: `/creators/${ticker}`,
	})
}
