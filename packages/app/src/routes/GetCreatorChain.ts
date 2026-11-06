import { notFound } from '@hapi/boom'
import assert from 'node:assert'
import { CHAIN_ID, CHAIN_PUBLIC_RPC_URL } from '../consts.ts'
import { isChainConfigured, readPoolTokens } from '../integrations/chain.ts'
import { getCreatorChain } from '../queries.ts'
import type { ITypedExpressRequest } from '../types/openapi.ts'

/**
 * `GET /creators/{ticker}/chain`: how the browser trades this creator. `live`
 * needs a configured chain and a deployed pool; otherwise the SQL path.
 */
export default async function GetCreatorChainRoute(
	req: ITypedExpressRequest<'GetCreatorChain'>,
) {
	const [row] = await getCreatorChain.run({ ticker: req.params.ticker }, req.pg)
	assert(row, notFound('Creator not found'))
	const pool = row.pool_address
	if(
		!isChainConfigured() || !pool || !row.contract_address
		|| !row.token_address || !CHAIN_PUBLIC_RPC_URL
	) {
		req.res!.json({ mode: 'simulated' })
		return
	}

	const { usdc } = await readPoolTokens(pool as `0x${string}`)
	req.res!.json({
		mode: 'live',
		chainId: CHAIN_ID,
		rpcUrl: CHAIN_PUBLIC_RPC_URL,
		isa: row.contract_address,
		token: row.token_address,
		pool,
		usdc,
	})
}
