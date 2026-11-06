import {
	ZG_INDEXER_URL,
	ZG_PRIVATE_KEY,
	ZG_RPC_URL,
	ZG_STORAGE_MIN_BALANCE,
} from '../../consts.ts'
import { LOGGER } from '../../logger.ts'
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

	async skipReason() {
		if(!ZG_PRIVATE_KEY) {
			return '0G key unset'
		}

		const { ethers } = await import('ethers')
		const rpc = new ethers.JsonRpcProvider(ZG_RPC_URL)
		const wallet = new ethers.Wallet(ZG_PRIVATE_KEY)
		const balance = await rpc.getBalance(wallet.address)
		const floor = ethers.parseEther(String(ZG_STORAGE_MIN_BALANCE))
		return balance < floor
			? `0G balance ${ethers.formatEther(balance)} is below the`
				+ ` ${ZG_STORAGE_MIN_BALANCE} 0G storage floor`
			: null
	}

	async putJson(input: StoragePutInput): Promise<StoragePutResult> {
		const { json, contentHash } = buildStorageDocument(input)
		const { ethers } = await import('ethers')
		const { Indexer, MemData } = await import('@0gfoundation/0g-storage-ts-sdk')
		const rpc = new ethers.JsonRpcProvider(ZG_RPC_URL)
		const signer = new ethers.Wallet(ZG_PRIVATE_KEY, rpc)
		// Faucet 0G is scarce: below the floor, throw so FallbackStorage keeps
		// the document locally instead of spending the last of the balance.
		const before = await rpc.getBalance(signer.address)
		const floor = ethers.parseEther(String(ZG_STORAGE_MIN_BALANCE))
		if(before < floor) {
			throw new Error(
				`0G balance ${ethers.formatEther(before)} is below the`
				+ ` ${ZG_STORAGE_MIN_BALANCE} 0G storage floor`,
			)
		}

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

		const after = await rpc.getBalance(signer.address)
		LOGGER.info({
			kind: input.kind,
			cost0g: ethers.formatEther(before - after),
			balance0g: ethers.formatEther(after),
		}, '0G Storage upload')

		const ref = tree.rootHash()
		if(!ref) {
			throw new Error('0G Storage returned no root hash')
		}

		return { ref, contentHash }
	}

}
