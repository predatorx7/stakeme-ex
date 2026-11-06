import { CHAIN_JOB_BATCH } from '../consts.ts'
import { LOGGER } from '../logger.ts'
import {
	claimStorageUpload,
	completeStorageUpload,
	listDueStorageUploads,
} from '../queries.ts'
import {
	createUploadProvider,
	inputFromDocument,
	type IStorageProvider,
} from '../services/index.ts'
import type { IPgClientLike } from '../types/index.ts'

let running: Promise<number> | undefined

/**
 * Uploads every due QUEUED document in `storage_uploads` to 0G Storage, one
 * at a time (each takes about 30 s and signs with one wallet). The request
 * that queued it already committed `local:<sha256>`; `complete_storage_upload`
 * swaps in the root hash and emits STORAGE_CONFIRMED. Without a key or below
 * the balance floor the upload is SKIPPED and the local ref stays. Failures
 * retry with backoff (3 attempts, in SQL). An already UPLOADED content hash is
 * never uploaded again (`claim_storage_upload`). Overlap-safe like
 * `processChainJobs`. Returns the number of uploads settled.
 */
export function processStorageUploads(
	pg: IPgClientLike,
	provider: IStorageProvider = createUploadProvider(),
): Promise<number> {
	running ||= drain(pg, provider).finally(() => {
		running = undefined
	})
	return running
}

async function drain(pg: IPgClientLike, provider: IStorageProvider) {
	let settled = 0
	for(;;) {
		const due = await listDueStorageUploads.run({ batch: CHAIN_JOB_BATCH }, pg)
		if(!due.length) {
			return settled
		}

		for(const { id } of due) {
			// Claiming leases the row: a second worker process skips it.
			const [row] = await claimStorageUpload.run({ id }, pg)
			if(!row) {
				continue
			}

			settled++
			// Already UPLOADED under another row with this content hash.
			if(row.status === 'QUEUED') {
				await upload(pg, provider, { ...row, id })
			}
		}
	}
}

async function upload(
	pg: IPgClientLike,
	provider: IStorageProvider,
	row: { id: string, document: unknown, content_hash: string | null },
) {
	try {
		const skip = await provider.skipReason?.()
		if(skip) {
			LOGGER.info({ uploadId: row.id, skip }, '0G Storage upload skipped')
			await settle(pg, row.id, 'SKIPPED', null, null)
			return
		}

		const { ref, contentHash } = await provider.putJson(
			inputFromDocument(row.document),
		)
		if(contentHash !== row.content_hash) {
			throw new Error('stored document does not match its content hash')
		}

		await settle(pg, row.id, 'UPLOADED', ref, null)
	} catch(err) {
		LOGGER.error({ err, uploadId: row.id }, '0G Storage upload failed')
		const message = err instanceof Error ? err.message : 'upload failed'
		await settle(pg, row.id, 'FAILED', null, message.slice(0, 1000))
	}
}

function settle(
	pg: IPgClientLike,
	id: string,
	status: 'UPLOADED' | 'SKIPPED' | 'FAILED',
	ref: string | null,
	error: string | null,
) {
	return completeStorageUpload.run(
		{ id, status, ref, error, transient: status === 'FAILED' },
		pg,
	)
}
