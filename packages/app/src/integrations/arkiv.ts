import { parseUnits, stringToBytes } from 'viem'
import { ARKIV_ACCESS_KEY, ARKIV_PRIVATE_KEY } from '../consts.ts'
import { LOGGER } from '../logger.ts'
import type { LisaTerms, StoredTerms } from './types.ts'
import { canonicalJson, nullifierHash, sha256Hex } from './util.ts'

const TERMS_VERSION = 1

/**
 * Pure: the canonical terms payload per `/arkiv/schema.md`. Money in USDC
 * micro units, tranches as whole percentages, nullifier hashed.
 */
export function buildTermsPayload(terms: LisaTerms) {
	return {
		creator_ticker: terms.ticker,
		creator_wallet: terms.creatorWallet.toLowerCase(),
		display_name: terms.displayName,
		share_bps: terms.shareBps,
		term_months: terms.termMonths,
		target_raise: microNumber(terms.targetRaise),
		stake_amount: microNumber(terms.stakeAmount),
		tranche_schedule: terms.trancheBps.map((bps) => bps / 100),
		world_id_nullifier_hash: nullifierHash(terms.worldIdNullifier),
		version: TERMS_VERSION,
	}
}

/** Pure: canonical JSON and its sha256 hex (the `terms_hash`). */
export function hashTerms(terms: LisaTerms) {
	const canonical = canonicalJson(buildTermsPayload(terms))
	return { canonical, termsHash: sha256Hex(canonical) }
}

export function isArkivConfigured() {
	return !!ARKIV_PRIVATE_KEY
}

/**
 * Stores the L-ISA terms as an Arkiv entity (schema `smx.lisa_terms`).
 * Without `ARKIV_PRIVATE_KEY` (or when the write fails) the record stays
 * local and `entityKey` is `local:<termsHash>`.
 */
export async function storeTerms(terms: LisaTerms): Promise<StoredTerms> {
	const { canonical, termsHash } = hashTerms(terms)
	const local = { entityKey: `local:${termsHash}`, termsHash }
	if(!isArkivConfigured()) {
		LOGGER.warn('Arkiv key unset: terms kept as a local record')
		return local
	}

	try {
		const payload = buildTermsPayload(terms)
		const { createWalletClient } = await import('@arkiv-network/sdk')
		const { rabdi } = await import('@arkiv-network/sdk/chains')
		const { addr, bytes, defineSchema, str, u64 } = await import(
			'@arkiv-network/sdk/schema'
		)
		const { ExpirationTime } = await import('@arkiv-network/sdk')
		const { http } = await import('viem')
		const { privateKeyToAccount } = await import('viem/accounts')

		const LisaTermsSchema = defineSchema('smx.lisa_terms', {
			creator_ticker: str().indexed(),
			creator_wallet: addr().indexed(),
			share_bps: u64().indexed(),
			term_months: u64().indexed(),
			target_raise: u64().indexed(),
			stake_amount: u64().indexed(),
			world_id_nullifier_hash: str().indexed(),
			terms_hash: str().indexed(),
			status: str().indexed(),
			tranche_schedule: str(),
			terms: bytes(),
			mimeType: str().default('application/json'),
		})

		const client = createWalletClient({
			chain: rabdi({ accessKey: ARKIV_ACCESS_KEY }),
			transport: http(),
			// Cast: env string is validated as a key by viem at signing time.
			account: privateKeyToAccount(ARKIV_PRIVATE_KEY as `0x${string}`),
		})
		const { entityKey } = await client.createEntity(
			LisaTermsSchema,
			{
				creator_ticker: payload.creator_ticker,
				creator_wallet: addr(terms.creatorWallet),
				share_bps: u64(BigInt(payload.share_bps)),
				term_months: u64(BigInt(payload.term_months)),
				target_raise: u64(BigInt(payload.target_raise)),
				stake_amount: u64(BigInt(payload.stake_amount)),
				world_id_nullifier_hash: payload.world_id_nullifier_hash,
				terms_hash: termsHash,
				status: 'DRAFT',
				tranche_schedule: JSON.stringify(payload.tranche_schedule),
				terms: stringToBytes(canonical),
			},
			// ~182 days max per write; the worker re-extends (see arkiv/schema.md).
			{ expiration: ExpirationTime.max() },
		)
		return { entityKey, termsHash }
	} catch(err) {
		LOGGER.error({ err }, 'Arkiv write failed: keeping a local record')
		return local
	}
}

function microNumber(decimal: string) {
	const micro = parseUnits(decimal, 6)
	if(micro > BigInt(Number.MAX_SAFE_INTEGER)) {
		throw new Error(`amount too large: ${decimal}`)
	}

	return Number(micro)
}
