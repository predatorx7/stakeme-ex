import { badRequest } from '@hapi/boom'
import assert from 'node:assert'
import { trade } from '../queries.ts'
import type { ITypedExpressRequest } from '../types/openapi.ts'
import { respondMutation } from '../utils/mutation.ts'

/** `POST /creators/{ticker}/trades` — simulated AMM swap. */
export default async function TradeRoute(
	req: ITypedExpressRequest<'Trade'>,
) {
	const wallet = req.authMetadata!.walletAddress
	assert(wallet, badRequest('Link a wallet to trade'))
	const [row] = await trade.run(
		{
			ticker: req.params.ticker,
			wallet,
			side: req.body.side,
			amount_in: req.body.amountIn,
			min_out: req.body.minOut ?? '0',
		},
		req.pg,
	)
	respondMutation(req, req.res!, { body: row.j, trigger: 'smx:traded' })
}
