import { STORAGE_PROVIDER, ZG_PRIVATE_KEY } from '../../consts.ts'
import { LOGGER } from '../../logger.ts'
import { LocalStorageProvider } from './local-storage.ts'
import type {
	IStorageProvider,
	StoragePutInput,
	StoragePutResult,
} from './storage-provider.ts'
import { ZeroGravityStorage } from './zero-gravity-storage.ts'

export type * from './storage-provider.ts'
export { LocalStorageProvider } from './local-storage.ts'
export { ZeroGravityStorage } from './zero-gravity-storage.ts'
export {
	buildStorageDocument,
	inputFromDocument,
	prepareStorage,
} from './storage-document.ts'
export { hashTerms, prepareTerms } from './terms.ts'

/** Uses `primary`; when a write fails, records it with `fallback` instead. */
export class FallbackStorage implements IStorageProvider {

	readonly #primary: IStorageProvider
	readonly #fallback: IStorageProvider

	constructor(primary: IStorageProvider, fallback: IStorageProvider) {
		this.#primary = primary
		this.#fallback = fallback
	}

	get name() {
		return this.#primary.name
	}

	async putJson(input: StoragePutInput): Promise<StoragePutResult> {
		try {
			return await this.#primary.putJson(input)
		} catch(err) {
			LOGGER.error(
				{ err, provider: this.#primary.name },
				'storage write failed: local ref',
			)
			return this.#fallback.putJson(input)
		}
	}

	async getJson(ref: string) {
		return (this.#primary.getJson?.(ref) ?? undefined)
			?? this.#fallback.getJson?.(ref)
	}

}

let cached: IStorageProvider | undefined
let cachedUploader: IStorageProvider | undefined

/**
 * Picks the storage adapter from `STORAGE_PROVIDER` (`0g` | `local`, default
 * `0g`). `0g` without `ZG_PRIVATE_KEY`, or when an upload fails, degrades to
 * `LocalStorageProvider`.
 *
 * To add a provider, implement `IStorageProvider`, add its name to the
 * `STORAGE_PROVIDER` union in `consts.ts` and a `case` below.
 */
export function createStorageProvider(): IStorageProvider {
	cached ||= build()
	return cached
}

/**
 * The provider the upload worker uses: the raw 0G provider with no local
 * fallback (a failed upload must retry, not silently become a local ref), or
 * the local one when `STORAGE_PROVIDER=local` or no key is set (the worker
 * then marks every upload SKIPPED).
 */
export function createUploadProvider(): IStorageProvider {
	cachedUploader ||= STORAGE_PROVIDER === 'local' || !ZG_PRIVATE_KEY
		? new LocalStorageProvider()
		: new ZeroGravityStorage()
	return cachedUploader
}

/** Test hook: forget the cached providers. */
export function resetStorageProvider() {
	cached = undefined
	cachedUploader = undefined
}

function build(): IStorageProvider {
	const local = new LocalStorageProvider()
	switch (STORAGE_PROVIDER) {
		case 'local':
			return local
		case '0g':
		default:
			if(!ZG_PRIVATE_KEY) {
				LOGGER.warn('0G keys unset: local storage fallback active')
				return local
			}

			return new FallbackStorage(new ZeroGravityStorage(), local)
	}
}
