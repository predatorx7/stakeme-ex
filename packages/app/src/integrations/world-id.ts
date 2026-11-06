import { badRequest, Boom, serverUnavailable } from '@hapi/boom'
import assert from 'node:assert'
import {
	DEMO_MODE,
	WORLD_ACTION,
	WORLD_APP_ID,
	WORLD_ENV,
	WORLD_RP_ID,
	WORLD_RP_SIGNING_KEY,
} from '../consts.ts'
import { LOGGER } from '../logger.ts'
import type { WorldIdVerifyInput, WorldIdVerifyResult } from './types.ts'
import { canonicalJson, field, keccakUtf8 } from './util.ts'

const VERIFY_URL = 'https://developer.world.org/api/v4/verify'

export type WorldIdRequest = {
	/** RP signature fields for `IDKit.request({ rp_context })`. */
	rpContext: {
		rp_id: string
		nonce: string
		created_at: number
		expires_at: number
		signature: string
	}
	appId: string
	action: string
	environment: 'staging' | 'production'
	/** The signal the proof must commit to (lowercase wallet). */
	signal: string
	/** True when no World ID keys are set; the browser shows simulators. */
	demo: boolean
}

/** Real flow needs the Developer Portal app, RP id and signing key. */
export function isWorldIdConfigured() {
	return !!(WORLD_APP_ID && WORLD_RP_ID && WORLD_RP_SIGNING_KEY)
}

/**
 * Server half of the IDKit request: signs the RP context for the action.
 * Expose from a route (for example `POST /api/world-id/rp-signature`); the
 * signing key never leaves the server. Without keys, returns `demo: true`.
 */
export async function createWorldIdRequest(
	signal: string,
): Promise<WorldIdRequest> {
	const base = {
		appId: WORLD_APP_ID,
		action: WORLD_ACTION,
		environment: WORLD_ENV,
		signal: signal.toLowerCase(),
	}
	if(!isWorldIdConfigured()) {
		LOGGER.warn('World ID keys unset: demo mode (simulated proofs)')
		return {
			...base,
			demo: true,
			rpContext: {
				rp_id: '',
				nonce: '',
				created_at: 0,
				expires_at: 0,
				signature: '',
			},
		}
	}

	const { signRequest } = await import('@worldcoin/idkit-core/signing')
	const sig = signRequest({
		signingKeyHex: WORLD_RP_SIGNING_KEY,
		action: WORLD_ACTION,
	})
	return {
		...base,
		demo: false,
		rpContext: {
			rp_id: WORLD_RP_ID,
			nonce: sig.nonce,
			created_at: sig.createdAt,
			expires_at: sig.expiresAt,
			signature: sig.sig,
		},
	}
}

/**
 * Verifies the IDKit result the browser posted and returns the nullifier.
 *
 * - Real: environment, action and signal-hash checks, then the Developer
 *   Portal v4 verify endpoint.
 * - Demo (`DEMO_MODE=1`): fixture proofs (`demo: true`) are accepted. The
 *   nullifier is deterministic from the payload, so the "Sybil" fixture
 *   (same seed twice) yields the same nullifier for any wallet.
 */
export async function verifyWorldIdProof(
	{ proof, signal }: WorldIdVerifyInput,
): Promise<WorldIdVerifyResult> {
	const isDemoProof = field(proof, 'demo') === true
	if(isDemoProof || !isWorldIdConfigured()) {
		assert(
			DEMO_MODE,
			serverUnavailable(
				isDemoProof
					? 'Demo World ID proofs are disabled'
					: 'World ID is not configured',
			),
		)
		LOGGER.warn('World ID demo fallback active: proof NOT verified')
		return { nullifier: demoWorldIdNullifier(proof), simulated: true }
	}

	return verifyReal(proof, signal)
}

/**
 * Deterministic fake nullifier (decimal, under 2^253) from a demo payload.
 * Uses `demoNullifier`, else `responses[0].nullifier`, else the payload.
 */
export function demoWorldIdNullifier(proof: unknown): string {
	const explicit = field(proof, 'demoNullifier')
		?? field(firstResponse(proof), 'nullifier')
	const seed = typeof explicit === 'string' && explicit
		? explicit
		: canonicalJson(stripVolatile(proof))
	return (BigInt(keccakUtf8(seed)) >> 3n).toString()
}

/** Builds the `demo: true` proof the browser simulators post. */
export function demoWorldIdProof(kind: 'success' | 'sybil', nonce: string) {
	return {
		demo: true,
		environment: 'staging',
		action: WORLD_ACTION,
		responses: [{
			identifier: 'proof_of_human',
			signal_hash: '0x0',
			// Sybil reuses one seed, so a second creator maps to the same human.
			nullifier: kind === 'sybil' ? 'smx-demo-sybil' : `smx-demo-${nonce}`,
		}],
	}
}

async function verifyReal(proof: unknown, signal: string) {
	const environment = field(proof, 'environment')
	assert(
		environment === WORLD_ENV,
		badRequest('World ID environment mismatch'),
	)
	assert(
		field(proof, 'action') === WORLD_ACTION,
		badRequest('World ID action mismatch'),
	)

	const response = firstResponse(proof)
	const nullifierRaw = field(response, 'nullifier')
	assert(typeof nullifierRaw === 'string', badRequest('Missing nullifier'))

	// The proof must commit to the session wallet, so it can't be replayed.
	const { hashSignal } = await import('@worldcoin/idkit-core/hashing')
	const signalHash = field(response, 'signal_hash')
	assert(
		typeof signalHash === 'string'
		&& signalHash.toLowerCase()
			=== hashSignal(signal.toLowerCase()).toLowerCase(),
		badRequest('World ID signal does not match the wallet'),
	)

	const res = await fetch(`${VERIFY_URL}/${WORLD_RP_ID}`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(proof),
	})
	const body: unknown = await res.json().catch(() => ({}))
	if(!res.ok || field(body, 'success') !== true) {
		LOGGER.warn({ status: res.status, body }, 'World ID verify rejected')
		throw new Boom('World ID verification failed', {
			statusCode: 400,
			data: { detail: field(body, 'detail') },
		})
	}

	// Decimal in v4 results; legacy v3 results are 0x hex. BigInt reads both.
	return {
		nullifier: BigInt(nullifierRaw).toString(),
		simulated: WORLD_ENV === 'staging',
	}
}

function firstResponse(proof: unknown) {
	const responses = field(proof, 'responses')
	return Array.isArray(responses) ? responses[0] : undefined
}

function stripVolatile(proof: unknown) {
	// A `nonce`/`created_at` differs per request even for the same human.
	return proof && typeof proof === 'object'
		? Object.fromEntries(
			Object.entries(proof)
				.filter(([k]) => k !== 'nonce' && k !== 'created_at'),
		)
		: proof
}
