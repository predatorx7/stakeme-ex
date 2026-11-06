import { badRequest, Boom } from '@hapi/boom'
import assert from 'node:assert'
import { verifyWorldIdProof } from '../integrations/index.ts'
import { LOGGER } from '../logger.ts'
import { checkLaunchable } from '../queries.ts'
import type { ITypedExpressRequest } from '../types/openapi.ts'

/**
 * `POST /api/world-id/check` — verify the proof and reject a reused (409) or
 * blacklisted (403) nullifier right after IDKit returns, so the launch form
 * never enables submit for a Sybil. `LaunchIpo` repeats both checks.
 */
export default async function CheckWorldId(
	req: ITypedExpressRequest<'CheckWorldId'>,
) {
	const wallet = req.authMetadata!.walletAddress
	assert(wallet, badRequest('Link a wallet before verifying with World ID'))

	let world: Awaited<ReturnType<typeof verifyWorldIdProof>>
	try {
		world = await verifyWorldIdProof({
			proof: req.body.worldIdProof,
			signal: wallet,
		})
	} catch(err) {
		if(err instanceof Boom) {
			throw err
		}

		LOGGER.warn({ err }, 'World ID verification failed')
		throw badRequest('World ID proof could not be verified')
	}

	await checkLaunchable.run({ nullifier: world.nullifier }, req.pg)
	req.res!.json({ launchable: true, simulated: world.simulated })
}
