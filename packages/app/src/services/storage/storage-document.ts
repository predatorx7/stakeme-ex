import { canonicalJson, sha256Hex } from '../../integrations/util.ts'
import type { StoragePutInput } from './storage-provider.ts'

/** The exact document a provider stores: input only, no clock, so stable. */
export function buildStorageDocument(input: StoragePutInput) {
	const json = canonicalJson({
		version: 1,
		kind: input.kind,
		key: input.key,
		attributes: input.attributes ?? {},
		data: input.data,
	})
	return { json, contentHash: sha256Hex(json) }
}
