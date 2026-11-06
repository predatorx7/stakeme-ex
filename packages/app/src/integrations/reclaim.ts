import { badRequest, serverUnavailable } from '@hapi/boom'
import type { Proof } from '@reclaimprotocol/js-sdk'
import assert from 'node:assert'
import { randomUUID } from 'node:crypto'
import {
	canonicalOrigin,
	DEMO_MODE,
	RECLAIM_APP_ID,
	RECLAIM_APP_SECRET,
	RECLAIM_PROVIDER_ID,
} from '../consts.ts'
import { LOGGER } from '../logger.ts'
import type {
	ReclaimSession,
	ReclaimSessionInput,
	VerifiedIncome,
} from './types.ts'
import { field } from './util.ts'

/** Proofs older than this are rejected (with the dedupe id: replay guard). */
const MAX_PROOF_AGE_S = 15 * 60
const MAX_FUTURE_SKEW_S = 5 * 60
const AMOUNT_KEYS = ['amount', 'deposit_amount', 'income']

export function isReclaimConfigured() {
	return !!(RECLAIM_APP_ID && RECLAIM_APP_SECRET && RECLAIM_PROVIDER_ID)
}

/** Fixture proof accepted only when `DEMO_MODE=1`. */
export type DemoIncomeProof = {
	demo: true
	/** USDC decimal string. */
	amount: string
	/** Creator id, echoed like the real proof's context. */
	context: string
	/** Dedupe id (the real proof's claim identifier). */
	id: string
}

/** Builds the demo fixture for `context` (creator id) and `amount`. */
export function demoIncomeProof(
	context: string,
	amount = '5000.00',
): DemoIncomeProof {
	const id = `0xdemo${randomUUID().replaceAll('-', '')}`
	return { demo: true, amount, context, id }
}

/**
 * Creates a Reclaim verification request on the server. Only the request and
 * status URLs go to the browser: the app secret stays here.
 */
export async function createReclaimSession(
	input: ReclaimSessionInput,
): Promise<ReclaimSession> {
	if(!isReclaimConfigured()) {
		assert(DEMO_MODE, serverUnavailable('Reclaim is not configured'))
		LOGGER.warn('Reclaim keys unset: demo session (no zkTLS proof)')
		const sessionId = randomUUID()
		return {
			sessionId,
			requestUrl: `${canonicalOrigin()}/mock-bank?session=${sessionId}`,
			statusUrl: input.callbackUrl,
		}
	}

	const { ReclaimProofRequest } = await import('@reclaimprotocol/js-sdk')
	const request = await ReclaimProofRequest.init(
		RECLAIM_APP_ID,
		RECLAIM_APP_SECRET,
		RECLAIM_PROVIDER_ID,
	)
	// true: Reclaim POSTs the proof as a JSON body.
	request.setAppCallbackUrl(input.callbackUrl, true)
	request.setContext(input.context, JSON.stringify({ ticker: input.ticker }))
	return {
		sessionId: request.getSessionId(),
		requestUrl: await request.getRequestUrl(),
		statusUrl: request.getStatusUrl(),
	}
}

/**
 * Verifies a proof posted to the Reclaim callback and extracts the deposit.
 * Dedupe is the caller's job: store `proofId` under a unique index.
 */
export async function verifyIncomeProof(
	proofOrProofs: unknown,
): Promise<VerifiedIncome> {
	const proof = Array.isArray(proofOrProofs) ? proofOrProofs[0] : proofOrProofs

	if(field(proof, 'demo') === true) {
		assert(DEMO_MODE, serverUnavailable('Demo proofs are disabled'))
		LOGGER.warn('Reclaim demo fallback active: proof NOT verified')
		return parseDemoProof(proof)
	}

	assert(
		isReclaimConfigured(),
		serverUnavailable('Reclaim is not configured'),
	)
	// Cast: the callback body is untrusted JSON; `verifyProof` validates the
	// structure (signatures, witnesses, claim identifier) and rejects bad ones.
	const typed = proof as Proof
	assert(typed && typeof typed === 'object', badRequest('Invalid proof'))

	const { verifyProof } = await import('@reclaimprotocol/js-sdk')
	const result = await verifyProof(typed, {
		providerId: RECLAIM_PROVIDER_ID,
		// A TEE attestation, when the proof carries one, must also check out.
		...(typed.teeAttestation
			? { teeAttestation: { appSecret: RECLAIM_APP_SECRET } }
			: {}),
	})
	if(!result.isVerified) {
		LOGGER.warn({ err: String(result.error) }, 'Reclaim proof rejected')
		throw badRequest('Reclaim proof failed verification')
	}

	assertFresh(typed.claimData.timestampS)
	const trusted = result.data[0]
	assert(trusted, badRequest('Proof has no claim data'))

	const amount = extractIncomeAmount(trusted.extractedParameters)
	assert(amount, badRequest('Proof has no deposit amount'))
	return {
		proofId: typed.claimData.identifier || typed.identifier,
		provider: RECLAIM_PROVIDER_ID,
		amount,
		context: String(trusted.context?.contextAddress ?? ''),
		raw: proof,
	}
}

/**
 * Reads the deposit from extracted parameters (strings). Accepts `5000`,
 * `5,000.00` and `$5000.5`; returns a decimal string with 2 to 6 dp, or
 * `null` when absent or malformed.
 */
export function extractIncomeAmount(extracted: unknown): string | null {
	for(const key of AMOUNT_KEYS) {
		const raw = field(extracted, key)
		if(typeof raw !== 'string' && typeof raw !== 'number') {
			continue
		}

		const clean = String(raw).replace(/[$,\s]/g, '')
		if(!/^\d+(\.\d{1,6})?$/.test(clean)) {
			return null
		}

		const [whole, frac = ''] = clean.split('.')
		return `${whole}.${frac.padEnd(2, '0')}`
	}

	return null
}

function parseDemoProof(proof: unknown): VerifiedIncome {
	const amount = extractIncomeAmount({ amount: field(proof, 'amount') })
	const context = field(proof, 'context')
	const id = field(proof, 'id')
	assert(amount, badRequest('Demo proof needs a valid amount'))
	assert(
		typeof context === 'string' && context && typeof id === 'string' && id,
		badRequest('Demo proof needs context and id'),
	)
	return { proofId: id, provider: 'demo', amount, context, raw: proof }
}

function assertFresh(timestampS: number) {
	const age = Date.now() / 1000 - timestampS
	assert(
		age <= MAX_PROOF_AGE_S && age >= -MAX_FUTURE_SKEW_S,
		badRequest('Stale proof: run the verification again'),
	)
}
