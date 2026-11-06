import { badRequest, conflict, notFound } from '@hapi/boom'
import assert from 'node:assert'
import {
	decodeSwapReceipt,
	isChainConfigured,
	verifyUserTx,
} from '../integrations/chain.ts'
import { getCreatorChain, ingestOnchainSwap, trade } from '../queries.ts'
import type { ITypedExpressRequest } from '../types/openapi.ts'
import { respondMutation } from '../utils/mutation.ts'

/**
 * `POST /creators/{ticker}/trades`. Live chain mode: records the user-signed
 * pool swap behind `txHash` from its verified receipt (chain is the truth).
 * Simulated chain mode: the SQL-simulated AMM swap.
 */
export default async function TradeRoute(
	req: ITypedExpressRequest<'Trade'>,
) {
	const wallet = req.authMetadata!.walletAddress
	assert(wallet, badRequest('Link a wallet to trade'))
	const { txHash, side, amountIn, minOut } = req.body
	const [chain] = await getCreatorChain.run(
		{ ticker: req.params.ticker },
		req.pg,
	)
	assert(chain, notFound('Creator not found'))
	const live = isChainConfigured() && !!chain.pool_address

	if(!txHash) {
		assert(!live, conflict('Sign this trade with your wallet'))
		assert(side && amountIn, badRequest('side and amountIn are required'))
		const [row] = await trade.run(
			{
				ticker: req.params.ticker,
				wallet,
				side,
				amount_in: amountIn,
				min_out: minOut ?? '0',
			},
			req.pg,
		)
		respondMutation(req, req.res!, { body: row.j, trigger: 'smx:traded' })
		return
	}

	assert(live, conflict('This creator does not trade onchain'))
	const pool = chain.pool_address!
	const logs = await verifyUserTx(txHash, { to: pool, from: wallet })
	const swap = await decodeSwapReceipt(logs, { pool, trader: wallet })
	const [row] = await ingestOnchainSwap.run(
		{
			creator_id: chain.id,
			trader: wallet,
			tx_hash: txHash,
			usdc_in: swap.usdcIn.toString(),
			token_in: swap.tokenIn.toString(),
			usdc_out: swap.usdcOut.toString(),
			token_out: swap.tokenOut.toString(),
			usdc_reserve: swap.usdcReserve.toString(),
			token_reserve: swap.tokenReserve.toString(),
		},
		req.pg,
	)
	respondMutation(req, req.res!, { body: row.j, trigger: 'smx:traded' })
}
