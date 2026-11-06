import { badRequest } from '@hapi/boom'
import assert from 'node:assert'
import { invest } from '../queries.ts'
import type { ITypedExpressRequest } from '../types/openapi.ts'
import { respondMutation } from '../utils/mutation.ts'

/** `POST /creators/{ticker}/investments` — primary-market purchase. */
export default async function InvestRoute(
	req: ITypedExpressRequest<'Invest'>,
) {
	const wallet = req.authMetadata!.walletAddress
	assert(wallet, badRequest('Link a wallet to invest'))
	const [row] = await invest.run(
		{
			ticker: req.params.ticker,
			wallet,
			usdc_amount: req.body.usdcAmount,
		},
		req.pg,
	)
	respondMutation(req, req.res!, { body: row.j, trigger: 'smx:invested' })
}
