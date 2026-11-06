/**
 * Lookup for a 0G Storage root hash on the Galileo testnet. The storagescan
 * site has no page keyed by root hash (only `/submission/<sequence>` and
 * `/address/<addr>`), so this links the storage indexer's file info JSON,
 * which confirms the root, its size and whether it is finalized.
 */
export function storageScanUrl(ref: string) {
	return `https://indexer-storage-testnet-turbo.0g.ai/file/info/${
		encodeURIComponent(ref)
	}`
}

/** Refs start with `local:` until the 0G upload lands (or when skipped). */
export function isLocalRef(ref: string) {
	return ref.startsWith('local:')
}
