import { badRequest, Boom, serverUnavailable } from '@hapi/boom'
import {
	ReclaimVerification,
	ResultVerificationError,
} from '@reclaimprotocol/client'
import assert from 'node:assert'
import { randomUUID } from 'node:crypto'
import {
	canonicalOrigin,
	DEMO_MODE,
	RECLAIM_BASE_URL,
	RECLAIM_ORG_ETH_PRIVATE_KEY,
	RECLAIM_ORG_SECRET,
	RECLAIM_PROVIDER_ID,
} from '../consts.ts'
import { LOGGER } from '../logger.ts'
import type {
	ProofRequestStatus,
	ReclaimSession,
	ReclaimSessionInput,
	VerifiedIncome,
} from './types.ts'
import { field } from './util.ts'

/** Proofs older than this are rejected (with the dedupe id: replay guard). */
const MAX_PROOF_AGE_S = 15 * 60
const MAX_FUTURE_SKEW_S = 5 * 60
const AMOUNT_KEYS = ['amount', 'deposit_amount', 'depositAmount', 'income']

/** Callback events that end a session without a usable proof. */
const FAILURE_EVENTS = {
	verification_rejected: 'REJECTED',
	verification_error: 'ERROR',
	verification_cancelled: 'CANCELLED',
	session_expired: 'EXPIRED',
} as const

export type ReclaimFailureStatus = (typeof FAILURE_EVENTS)[
	keyof typeof FAILURE_EVENTS
]

/** Org secret and provider id are the only required settings. */
export function isReclaimConfigured() {
	return !!(RECLAIM_ORG_SECRET && RECLAIM_PROVIDER_ID)
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
 * Creates a Reclaim verification session on the server
 * (`sessions.create`). Only the verification and status URLs go to the
 * browser: the org secret stays here.
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
			statusUrl: statusUrl(sessionId),
			orgId: null,
		}
	}

	const session = await client().sessions.create({
		providers: [{ providerId: RECLAIM_PROVIDER_ID }],
		context: { creatorId: input.context, ticker: input.ticker },
		// Binds the TEE nonce; only when the org key is provided.
		...(RECLAIM_ORG_ETH_PRIVATE_KEY
			? { orgEthPrivateKey: RECLAIM_ORG_ETH_PRIVATE_KEY }
			: {}),
	})
	return {
		sessionId: session.id,
		requestUrl: session.verificationUrl,
		statusUrl: statusUrl(session.id),
		orgId: session.orgId,
	}
}

/**
 * Remote status of a session (`GET /verifications/sessions/{id}`), for the
 * polling fallback. Null in demo mode or on a transient error.
 */
export async function getReclaimSessionStatus(
	sessionId: string,
): Promise<ProofRequestStatus | null> {
	if(!isReclaimConfigured()) {
		return null
	}

	try {
		const session = await client().sessions.get(sessionId)
		return session.status.toUpperCase() as ProofRequestStatus
	} catch(err) {
		LOGGER.warn({ err, sessionId }, 'Reclaim status fetch failed')
		return null
	}
}

/** Pure: reads the unauthenticated routing hints of a callback envelope. */
export function readDeliveryEnvelope(body: unknown) {
	const sessionId = field(body, 'sessionId')
	const event = field(body, 'event')
	return {
		sessionId: typeof sessionId === 'string' ? sessionId : undefined,
		event: typeof event === 'string' ? event : undefined,
		/** Set for events that end the session without a usable result. */
		failure: typeof event === 'string' && event in FAILURE_EVENTS
			? FAILURE_EVENTS[event as keyof typeof FAILURE_EVENTS]
			: undefined,
	}
}

/** What `results.receive` returns for a terminal result (structural). */
export type ReclaimResultLike = {
	proofs?: Array<{
		proofValid: boolean
		reason?: string
		proof?: {
			identifier: string
			claimData: { identifier: string, timestampS: number }
		}
		data?: {
			context: Record<string, unknown>
			extractedParameters: Record<string, string>
		}
	}>
}

/**
 * Pure: turns a verified Reclaim result into the income we audit. Only
 * `proofs[].data` is trusted (it comes from the verified proof, not the outer
 * payload). `creatorId` comes from our own session row.
 */
export function mapResultToIncome(
	result: ReclaimResultLike,
	creatorId: string,
	now = Date.now() / 1000,
): VerifiedIncome {
	const first = result.proofs?.[0]
	assert(first, badRequest('Result has no proofs'))
	assert(
		first.proofValid && first.data && first.proof,
		badRequest(`Proof is not valid${first.reason ? `: ${first.reason}` : ''}`),
	)
	assertFresh(first.proof.claimData.timestampS, now)
	const ctxCreator = first.data.context.creatorId
	assert(
		ctxCreator === undefined || ctxCreator === creatorId,
		badRequest('Proof was issued for another creator'),
	)
	const amount = extractIncomeAmount(first.data.extractedParameters)
	assert(amount, badRequest('Proof has no deposit amount'))
	return {
		proofId: first.proof.claimData.identifier || first.proof.identifier,
		provider: RECLAIM_PROVIDER_ID,
		amount,
		context: creatorId,
		raw: result,
	}
}

/**
 * Verifies a Reclaim callback delivery (`results.receive`) and extracts the
 * deposit. `expected` comes from our DB, never from the callback body. A
 * `ResultVerificationError` becomes a Boom: 503 when a retry can succeed
 * (Builder's JWKS/recipe unreachable), 400 otherwise.
 */
export async function verifyReclaimDelivery(
	body: unknown,
	expected: { sessionId: string, orgId: string | null, creatorId: string },
): Promise<VerifiedIncome> {
	assert(
		isReclaimConfigured(),
		serverUnavailable('Reclaim is not configured'),
	)
	try {
		const outcome = await client().results.receive(
			// Cast: the body is untrusted JSON; `receive` validates its structure.
			body as Parameters<ReturnType<typeof client>['results']['receive']>[0],
			{
				reclaimSessionId: expected.sessionId,
				...(expected.orgId ? { expectedAud: expected.orgId } : {}),
				...(RECLAIM_ORG_ETH_PRIVATE_KEY
					? { orgEthPrivateKey: RECLAIM_ORG_ETH_PRIVATE_KEY }
					: {}),
			},
		)
		assert(
			outcome.kind === 'result',
			badRequest('Delivery is a progress event, not a result'),
		)
		return mapResultToIncome(outcome.result, expected.creatorId)
	} catch(err) {
		if(err instanceof ResultVerificationError) {
			LOGGER.warn(
				{ reason: err.reason, retryable: err.retryable },
				'Reclaim result failed verification',
			)
			throw new Boom(`Reclaim result failed verification: ${err.reason}`, {
				statusCode: err.retryable ? 503 : 400,
			})
		}

		throw err
	}
}

/**
 * Demo fixtures (`DEMO_MODE=1`): `{ demo: true, amount, context, id }`.
 * Real proofs go through `verifyReclaimDelivery`.
 */
export function verifyDemoProof(proof: unknown): VerifiedIncome {
	assert(DEMO_MODE, serverUnavailable('Demo proofs are disabled'))
	LOGGER.warn('Reclaim demo fallback active: proof NOT verified')
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

let cached: ReturnType<typeof ReclaimVerification.create> | undefined
function client() {
	cached ||= ReclaimVerification.create({
		orgSecret: RECLAIM_ORG_SECRET,
		...(RECLAIM_BASE_URL ? { baseUrl: RECLAIM_BASE_URL } : {}),
	})
	return cached
}

function statusUrl(sessionId: string) {
	return `${canonicalOrigin()}/reclaim/sessions/${sessionId}`
}

function assertFresh(timestampS: number, now: number) {
	const age = now - timestampS
	assert(
		age <= MAX_PROOF_AGE_S && age >= -MAX_FUTURE_SKEW_S,
		badRequest('Stale proof: run the verification again'),
	)
}
