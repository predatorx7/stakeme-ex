import { badRequest } from '@hapi/boom'
import assert from 'node:assert'
import { createWorldIdRequest } from '../integrations/index.ts'
import type { ITypedExpressRequest } from '../types/openapi.ts'

/**
 * `POST /api/rp-signature` — signs the World ID 4.0 RP request on the server.
 * The signal is the SIWE session's wallet, never taken from the request.
 */
export default async function CreateRpSignature(
	req: ITypedExpressRequest<'CreateRpSignature'>,
) {
	const wallet = req.authMetadata!.walletAddress
	assert(wallet, badRequest('Link a wallet before verifying World ID'))
	req.res!.status(201).json(await createWorldIdRequest(wallet))
}
