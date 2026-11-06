import { canonicalJson, sha256Hex } from '../../integrations/util.ts'
import type { StoragePutInput } from './storage-provider.ts'

/** The exact document a provider stores: input only, no clock, so stable. */
export function buildStorageDocument(input: StoragePutInput) {
	const document = {
		version: 1,
		kind: input.kind,
		key: input.key,
		attributes: input.attributes ?? {},
		data: input.data,
	}
	const json = canonicalJson(document)
	return { document, json, contentHash: sha256Hex(json) }
}

/**
 * Synchronous half of an optimistic upload: the document and its hash are
 * known now, so the row commits with `local:<sha256>` while the worker
 * uploads `document` later (the root hash then replaces the local ref).
 */
export function prepareStorage(input: StoragePutInput) {
	const { document, contentHash } = buildStorageDocument(input)
	return { document, contentHash, localRef: `local:${contentHash}` }
}

/** Reads a stored `document` (jsonb) back into the provider input. */
export function inputFromDocument(document: unknown): StoragePutInput {
	// Cast: the document is built by `buildStorageDocument`, then round-tripped
	// through jsonb; the content hash is re-checked after the upload.
	const d = document as StoragePutInput
	return { kind: d.kind, key: d.key, data: d.data, attributes: d.attributes }
}
