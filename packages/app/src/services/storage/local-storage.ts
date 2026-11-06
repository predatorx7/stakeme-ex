import { buildStorageDocument } from './storage-document.ts'
import type {
	IStorageProvider,
	StoragePutInput,
	StoragePutResult,
} from './storage-provider.ts'

const MAX_ENTRIES = 500

/**
 * Fallback with no network: the ref is the content hash (`local:<sha256>`).
 * Documents are kept in memory (bounded) for `getJson`; they do not survive
 * a restart, but the hash still proves what the DB row refers to.
 */
export class LocalStorageProvider implements IStorageProvider {

	readonly name = 'local'
	readonly #docs = new Map<string, string>()

	async putJson(input: StoragePutInput): Promise<StoragePutResult> {
		const { json, contentHash } = buildStorageDocument(input)
		const ref = `local:${contentHash}`
		if(this.#docs.size >= MAX_ENTRIES) {
			// Maps iterate in insertion order: drop the oldest.
			this.#docs.delete(this.#docs.keys().next().value!)
		}

		this.#docs.set(ref, json)
		return { ref, contentHash }
	}

	async skipReason() {
		return 'local storage provider: nothing to upload'
	}

	async getJson(ref: string) {
		const json = this.#docs.get(ref)
		return json === undefined ? undefined : JSON.parse(json)
	}

}
