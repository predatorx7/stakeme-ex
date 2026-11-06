import { badRequest, Boom } from '@hapi/boom'
import assert from 'node:assert'
import {
	DEFAULT_SHARE_BPS,
	DEFAULT_TERM_MONTHS,
	DEFAULT_TRANCHE_BPS,
	DOMAIN_CHAIN_ID,
} from '../consts.ts'
import { verifyWorldIdProof } from '../integrations/index.ts'
import { LOGGER } from '../logger.ts'
import { checkLaunchable, launchIpo } from '../queries.ts'
import { prepareTerms } from '../services/index.ts'
import type { ITypedExpressRequest } from '../types/openapi.ts'
import { respondMutation } from '../utils/mutation.ts'

/**
 * `POST /creators` — verify World ID (signal = viewer wallet), build the L-ISA
 * terms document and its hash, then one SQL statement creates the IPO and
 * queues the 0G Storage upload (the worker swaps `local:<sha256>` for the root
 * hash later, so the request never waits on 0G). The SQL asserts every rule
 * (banned or reused nullifier, ticker, tranche sum).
 */
export default async function LaunchIpoRoute(
	req: ITypedExpressRequest<'LaunchIpo'>,
) {
	const viewer = req.authMetadata!
	const wallet = viewer.walletAddress
	assert(wallet, badRequest('Link a wallet before launching an IPO'))
	const b = req.body
	const shareBps = b.shareBps ?? DEFAULT_SHARE_BPS
	const termMonths = b.termMonths ?? DEFAULT_TERM_MONTHS

	let world: Awaited<ReturnType<typeof verifyWorldIdProof>>
	try {
		world = await verifyWorldIdProof({ proof: b.worldIdProof, signal: wallet })
	} catch(err) {
		if(err instanceof Boom) {
			throw err
		}

		LOGGER.warn({ err }, 'World ID verification failed')
		throw badRequest('World ID proof could not be verified')
	}

	// Cheap check first, so a banned human costs nothing more.
	await checkLaunchable.run({ nullifier: world.nullifier }, req.pg)

	const stored = prepareTerms({
		ticker: b.ticker,
		displayName: b.displayName,
		shareBps,
		termMonths,
		targetRaise: b.targetRaise,
		stakeAmount: b.stakeAmount,
		trancheBps: DEFAULT_TRANCHE_BPS,
		worldIdNullifier: world.nullifier,
		creatorWallet: wallet,
	})

	const [row] = await launchIpo.run(
		{
			owner: viewer.id,
			wallet,
			ticker: b.ticker,
			display_name: b.displayName,
			headline: b.headline ?? '',
			share_bps: shareBps,
			term_months: termMonths,
			target_raise: b.targetRaise,
			stake_amount: b.stakeAmount,
			nullifier: world.nullifier,
			terms_ref: stored.termsRef,
			terms_hash: stored.termsHash,
			terms_document: stored.document,
			chain_id: DOMAIN_CHAIN_ID,
		},
		req.pg,
	)
	const url = `/creators/${b.ticker}`
	respondMutation(req, req.res!, {
		body: row.j,
		redirect: url,
		location: url,
		trigger: 'smx:ipo-launched',
	})
}
