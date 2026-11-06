import { badRequest, conflict, notFound } from '@hapi/boom'
import assert from 'node:assert'
import { isChainConfigured, verifyUserTx } from '../integrations/chain.ts'
import { closeRaise, getCreatorChain, getOwnedCreator } from '../queries.ts'
import type { ITypedExpressRequest } from '../types/openapi.ts'
import { respondMutation } from '../utils/mutation.ts'

/**
 * `POST /creators/{ticker}/close-raise`. The contract's `closeRaise` is
 * creator-only, so in live chain mode the creator signs it in their wallet and
 * sends the `txHash`: the receipt is verified (sender = the owner's wallet,
 * target = the ISA) before the SQL closes the raise. Simulated chain mode runs
 * the SQL directly. The SQL checks ownership and that the raise is open.
 */
export default async function CloseRaiseRoute(
	req: ITypedExpressRequest<'CloseRaise'>,
) {
	const viewer = req.authMetadata!
	const { ticker } = req.params
	const [chain] = await getCreatorChain.run({ ticker }, req.pg)
	assert(chain, notFound('Creator not found'))
	const live = isChainConfigured() && !!chain.contract_address
	const txHash = req.body?.txHash
	if(live) {
		assert(txHash, conflict('Sign closeRaise with your wallet first'))
		assert(viewer.walletAddress, badRequest('Link a wallet first'))
		// Cheap owner check before the slow receipt wait.
		await getOwnedCreator.run({ ticker, viewer_id: viewer.id }, req.pg)
		await verifyUserTx(txHash, {
			to: chain.contract_address!,
			from: viewer.walletAddress,
		})
	}

	const [row] = await closeRaise.run({ ticker, viewer_id: viewer.id }, req.pg)
	respondMutation(req, req.res!, {
		body: { id: row.id },
		trigger: 'smx:raise-closed',
	})
}
