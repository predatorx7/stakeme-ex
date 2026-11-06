import { parseUnits } from 'viem'
import type { LisaTerms, StoredTerms } from '../../integrations/types.ts'
import {
	canonicalJson,
	nullifierHash,
	sha256Hex,
} from '../../integrations/util.ts'
import type { IStorageProvider } from './storage-provider.ts'

const TERMS_VERSION = 1

/**
 * Pure: the canonical legal-terms payload. Money in USDC micro units,
 * tranches as whole percentages, nullifier hashed (the raw one stays in SQL).
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

/** Writes the L-ISA legal terms through the storage provider. */
export async function storeTerms(
	storage: IStorageProvider,
	terms: LisaTerms,
): Promise<StoredTerms> {
	const { termsHash } = hashTerms(terms)
	const { ref } = await storage.putJson({
		kind: 'LISA_TERMS',
		key: `terms/${terms.ticker}`,
		data: buildTermsPayload(terms),
		attributes: { ticker: terms.ticker, termsHash },
	})
	return { termsRef: ref, termsHash }
}

function microNumber(decimal: string) {
	const micro = parseUnits(decimal, 6)
	if(micro > BigInt(Number.MAX_SAFE_INTEGER)) {
		throw new Error(`amount too large: ${decimal}`)
	}

	return Number(micro)
}
