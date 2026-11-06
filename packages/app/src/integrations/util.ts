import { createHash } from 'node:crypto'
import { keccak256, stringToBytes } from 'viem'

/** Stable JSON: object keys sorted, no whitespace. */
export function canonicalJson(value: unknown): string {
	return JSON.stringify(sortKeys(value))

	function sortKeys(v: unknown): unknown {
		if(Array.isArray(v)) {
			return v.map(sortKeys)
		}

		if(v && typeof v === 'object') {
			return Object.fromEntries(
				Object.entries(v)
					.filter(([, val]) => val !== undefined)
					.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
					.map(([k, val]) => [k, sortKeys(val)]),
			)
		}

		return v
	}
}

export function sha256Hex(data: string) {
	return createHash('sha256').update(data).digest('hex')
}

/** keccak256 of a UTF-8 string as 0x-hex (bytes32). */
export function keccakUtf8(data: string): `0x${string}` {
	return keccak256(stringToBytes(data))
}

/**
 * World ID nullifier (decimal string) to the bytes32 stored onchain and in
 * Arkiv. Hashed so the raw nullifier never lands in a public record.
 */
export function nullifierHash(nullifier: string): `0x${string}` {
	return keccakUtf8(nullifier)
}

/** Reads a plain-object field without casts. */
export function field(obj: unknown, key: string): unknown {
	return obj && typeof obj === 'object'
		? (obj as Record<string, unknown>)[key]
		: undefined
}
