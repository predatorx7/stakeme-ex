import { ZG_INDEXER_URL, ZG_PRIVATE_KEY, ZG_RPC_URL } from '../../consts.ts'
import { buildStorageDocument } from './storage-document.ts'
import type {
	IStorageProvider,
	StoragePutInput,
	StoragePutResult,
} from './storage-provider.ts'

/**
 * 0G Storage (Log Layer) provider. `putJson` uploads the canonical document
 * and returns the Merkle root hash as the ref. Throws on any failure; wrap it
 * in `FallbackStorage` to degrade to local refs.
 */
export class ZeroGravityStorage implements IStorageProvider {

	readonly name = '0g'

	async putJson(input: StoragePutInput): Promise<StoragePutResult> {
		const { json, contentHash } = buildStorageDocument(input)
		const { ethers } = await import('ethers')
		const { Indexer, MemData } = await import('@0gfoundation/0g-storage-ts-sdk')
		const signer = new ethers.Wallet(
			ZG_PRIVATE_KEY,
			new ethers.JsonRpcProvider(ZG_RPC_URL),
		)
		const file = new MemData(new TextEncoder().encode(json))
		const [tree, treeErr] = await file.merkleTree()
		if(treeErr !== null || !tree) {
			throw treeErr || new Error('no merkle tree')
		}

		const indexer = new Indexer(ZG_INDEXER_URL)
		// Cast: the storage SDK bundles ethers 6.13; same class, other copy.
		const [, uploadErr] = await indexer.upload(
			file,
			ZG_RPC_URL,
			signer as unknown as Parameters<typeof indexer.upload>[2],
		)
		if(uploadErr !== null) {
			throw uploadErr
		}

		const ref = tree.rootHash()
		if(!ref) {
			throw new Error('0G Storage returned no root hash')
		}

		return { ref, contentHash }
	}

}
