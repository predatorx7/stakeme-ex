/** Explorer page for a 0G Storage root hash on the Galileo testnet. */
export function storageScanUrl(ref: string) {
	return `https://storagescan-galileo.0g.ai/tool/file?root=${
		encodeURIComponent(ref)
	}`
}

/** Refs start with `local:` until the 0G upload lands (or when skipped). */
export function isLocalRef(ref: string) {
	return ref.startsWith('local:')
}
