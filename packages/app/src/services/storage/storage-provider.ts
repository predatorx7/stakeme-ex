export type StorageKind = 'LISA_TERMS' | 'AUDIT_LOG'

export type StoragePutInput = {
	kind: StorageKind
	/** Logical key, for example `terms/RAVI` or `audit/RAVI/2/<proofId>`. */
	key: string
	data: unknown
	attributes?: Record<string, string | number>
}

export type StoragePutResult = {
	/** Where to read it back: a 0G root hash or `local:<sha256>`. */
	ref: string
	/** sha256 hex of the canonical stored document (stable per input). */
	contentHash: string
}

/**
 * Append-only JSON storage for L-ISA terms and audit logs. Implementations
 * are interchangeable: the app only talks to this interface, picked by
 * `createStorageProvider()`.
 */
export interface IStorageProvider {
	readonly name: string
	putJson(input: StoragePutInput): Promise<StoragePutResult>
	getJson?(ref: string): Promise<unknown>
}
