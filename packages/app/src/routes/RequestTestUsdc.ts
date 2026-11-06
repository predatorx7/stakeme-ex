import { badRequest, conflict, tooManyRequests } from '@hapi/boom'
import assert from 'node:assert'
import { canRequestTestUsdc, requestTestUsdc } from '../integrations/chain.ts'
import type { ITypedExpressRequest } from '../types/openapi.ts'
import { respondMutation } from '../utils/mutation.ts'

/** USDC minted per request (the token's cap is 50,000). */
const FAUCET_AMOUNT = '1000'
const COOLDOWN_MS = 60_000
const lastRequest = new Map<string, number>()

/**
 * `POST /portfolio/faucet` — mints test USDC to the viewer's wallet through
 * MockUSDC's public faucet. One request per wallet per minute (per process).
 */
export default async function RequestTestUsdc(
	req: ITypedExpressRequest<'RequestTestUsdc'>,
) {
	const wallet = req.authMetadata!.walletAddress
	assert(wallet, badRequest('Link a wallet to get test USDC'))
	assert(
		canRequestTestUsdc(),
		conflict('Test USDC is only available on the live test network'),
	)
	const key = wallet.toLowerCase()
	const last = lastRequest.get(key)
	assert(
		!last || Date.now() - last >= COOLDOWN_MS,
		tooManyRequests('Wait a minute before requesting more test USDC'),
	)
	lastRequest.set(key, Date.now())
	let txHash: string
	try {
		txHash = await requestTestUsdc(wallet, FAUCET_AMOUNT)
	} catch(err) {
		lastRequest.delete(key)
		throw err
	}

	respondMutation(req, req.res!, {
		body: { amount: FAUCET_AMOUNT, txHash },
		redirect: '/portfolio',
	})
}
