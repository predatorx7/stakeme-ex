import { badRequest, conflict, notFound } from '@hapi/boom'
import assert from 'node:assert'
import {
	decodeClaimReceipt,
	forgetClaimable,
	isChainConfigured,
	verifyUserTx,
} from '../integrations/chain.ts'
import { getCreatorChain, ingestDividendClaim } from '../queries.ts'
import type { ITypedExpressRequest } from '../types/openapi.ts'
import { respondMutation } from '../utils/mutation.ts'

/**
 * `POST /portfolio/claims`. The holder signed `LiquidISA.claim()`; the receipt
 * is verified (sender = the viewer's wallet, target = the ISA, `Claimed` for
 * that wallet) and the claim is recorded. Idempotent by `txHash`.
 */
export default async function CreateDividendClaimRoute(
	req: ITypedExpressRequest<'CreateDividendClaim'>,
) {
	const wallet = req.authMetadata!.walletAddress
	assert(wallet, badRequest('Link a wallet to claim'))
	const { ticker, txHash } = req.body
	const [chain] = await getCreatorChain.run({ ticker }, req.pg)
	assert(chain, notFound('Creator not found'))
	const isa = chain.contract_address
	assert(
		isChainConfigured() && isa,
		conflict('This creator does not pay dividends onchain'),
	)
	const logs = await verifyUserTx(txHash, { to: isa, from: wallet })
	const { amount } = decodeClaimReceipt(logs, { isa, holder: wallet })
	const [claim] = await ingestDividendClaim.run(
		{
			creator_id: chain.id,
			wallet,
			tx_hash: txHash,
			amount: amount.toString(),
		},
		req.pg,
	)
	forgetClaimable(isa, wallet)
	respondMutation(req, req.res!, {
		body: { id: claim.id, amount: claim.amount, txHash: claim.tx_hash },
		trigger: 'smx:dividend-claimed',
	})
}
