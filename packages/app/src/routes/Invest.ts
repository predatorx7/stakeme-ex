import { badRequest, conflict, notFound } from '@hapi/boom'
import assert from 'node:assert'
import {
	decodeInvestReceipt,
	isChainConfigured,
	verifyUserTx,
} from '../integrations/chain.ts'
import { getCreatorChain, ingestOnchainInvest, invest } from '../queries.ts'
import type { ITypedExpressRequest } from '../types/openapi.ts'
import { respondMutation } from '../utils/mutation.ts'

/**
 * `POST /creators/{ticker}/investments`. Live chain mode: records the
 * user-signed `invest` behind `txHash` from its verified receipt, and on a
 * fill the pool reserves from the same receipt. Simulated chain mode: the
 * SQL primary-market purchase plus a queued oracle `invest` job.
 */
export default async function InvestRoute(
	req: ITypedExpressRequest<'Invest'>,
) {
	const wallet = req.authMetadata!.walletAddress
	assert(wallet, badRequest('Link a wallet to invest'))
	const { txHash, usdcAmount } = req.body
	const [chain] = await getCreatorChain.run(
		{ ticker: req.params.ticker },
		req.pg,
	)
	assert(chain, notFound('Creator not found'))
	const live = isChainConfigured()
		&& !!chain.pool_address && !!chain.contract_address

	if(!txHash) {
		assert(!live, conflict('Sign this investment with your wallet'))
		assert(usdcAmount, badRequest('usdcAmount is required'))
		const [row] = await invest.run(
			{ ticker: req.params.ticker, wallet, usdc_amount: usdcAmount },
			req.pg,
		)
		respondMutation(req, req.res!, { body: row.j, trigger: 'smx:invested' })
		return
	}

	assert(live, conflict('This creator does not take onchain investments'))
	const isa = chain.contract_address!
	const logs = await verifyUserTx(txHash, { to: isa, from: wallet })
	const inv = decodeInvestReceipt(logs, {
		isa,
		pool: chain.pool_address,
		investor: wallet,
	})
	const [row] = await ingestOnchainInvest.run(
		{
			creator_id: chain.id,
			investor: wallet,
			tx_hash: txHash,
			usdc: inv.usdc.toString(),
			shares: inv.shares.toString(),
			raise_closed: inv.raiseClosed,
			pool_usdc: inv.seeded?.usdc.toString() ?? null,
			pool_tokens: inv.seeded?.tokens.toString() ?? null,
		},
		req.pg,
	)
	respondMutation(req, req.res!, { body: row.j, trigger: 'smx:invested' })
}
