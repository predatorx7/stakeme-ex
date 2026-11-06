/* eslint-disable @stylistic/max-len, unicorn/no-await-expression-member */
import type { PGlite } from '@electric-sql/pglite'
import assert from 'node:assert'
import { after, before, describe, it } from 'node:test'
import type { IPgClientLike } from '../src/index.ts'
import {
	buildStorageDocument,
	type IStorageProvider,
	prepareStorage,
} from '../src/services/index.ts'
import { processStorageUploads } from '../src/worker/storage-uploads.ts'
import { createSeededPglite } from './pglite.ts'

const WALLET = '0x00000000000000000000000000000000000000a1'
const ROOT = `0x${'ab'.repeat(32)}`

let db: PGlite
let pg: IPgClientLike
let seq = 0

before(async() => {
	db = await createSeededPglite()
	await db.exec('SET search_path TO smx, public')
	pg = db as unknown as IPgClientLike
})
after(async() => {
	await db.close()
})

/** An IPO that commits a `local:` terms ref and queues `document`. */
async function launch(ticker: string, key = `terms/${ticker}`) {
	const n = ++seq
	const doc = prepareStorage({ kind: 'LISA_TERMS', key, data: { key } })
	const { rows: [u] } = await db.query<{ id: string }>(
		'INSERT INTO users(email, name) VALUES ($1, $2) RETURNING id',
		[`s${n}@test.co`, `user ${n}`],
	)
	const { rows: [c] } = await db.query<{ id: string }>(
		`SELECT id FROM launch_ipo($1, $2, $3, $3, '', 500, 60, 10000, 1000, $4,
			$5, 'h', 296, $6::jsonb)`,
		[u.id, WALLET, ticker, String(5000 + n), doc.localRef, JSON.stringify(doc.document)],
	)
	return { id: c.id, doc }
}

const creator = async(id: string) => (await db.query<{ terms_ref: string }>(
	'SELECT terms_ref FROM creators WHERE id = $1', [id],
)).rows[0]
const upload = async(id: string) => (await db.query<{ status: string, attempts: number, ref: string | null }>(
	'SELECT status, attempts, ref FROM storage_uploads WHERE creator_id = $1', [id],
)).rows[0]
const events = async(id: string) => (await db.query<{ payload: Record<string, string> }>(
	'SELECT payload FROM oracle_events WHERE creator_id = $1 AND kind = \'STORAGE_CONFIRMED\'', [id],
)).rows.map((r) => r.payload)

/** A provider that records uploads instead of calling 0G. */
function fakeProvider(opts: { skip?: string, fail?: boolean } = {}) {
	const calls: string[] = []
	const provider: IStorageProvider = {
		name: 'fake',
		skipReason: async() => opts.skip ?? null,
		putJson: async(input) => {
			calls.push(input.key)
			if(opts.fail) {
				throw new Error('indexer down')
			}

			return { ref: ROOT, contentHash: buildStorageDocument(input).contentHash }
		},
	}
	return { provider, calls }
}

describe('storage outbox', () => {
	it('keeps a pending local ref, then swaps in the root hash and emits the event', async() => {
		const { id, doc } = await launch('STOA')
		assert.strictEqual((await creator(id)).terms_ref, doc.localRef)
		assert.strictEqual((await upload(id)).status, 'QUEUED')
		const { rows: [j] } = await db.query<{ s: string }>(
			'SELECT creator_json(c)->>\'termsStorage\' s FROM creators c WHERE id = $1', [id],
		)
		assert.strictEqual(j.s, 'PENDING')

		const { provider, calls } = fakeProvider()
		await processStorageUploads(pg, provider)
		assert.deepStrictEqual(calls, ['terms/STOA'])
		assert.strictEqual((await creator(id)).terms_ref, ROOT)
		assert.strictEqual((await upload(id)).status, 'UPLOADED')
		const [event] = await events(id)
		assert.strictEqual(event.ref, ROOT)
		assert.strictEqual(event.kind, 'LISA_TERMS')
		assert.match(event.url, /^https:\/\/indexer-storage-testnet-turbo\.0g\.ai\/file\/info\//)
	})

	it('never uploads a content hash that is already UPLOADED', async() => {
		const first = await launch('STOB', 'terms/shared')
		const { provider, calls } = fakeProvider()
		await processStorageUploads(pg, provider)
		assert.strictEqual(calls.length, 1)

		// Same document again: born UPLOADED, ref applied at once.
		const dup = await launch('STOC', 'terms/shared')
		assert.strictEqual(dup.doc.localRef, first.doc.localRef)
		assert.strictEqual((await upload(dup.id)).status, 'UPLOADED')
		assert.strictEqual((await creator(dup.id)).terms_ref, ROOT)
		assert.strictEqual((await events(dup.id)).length, 1)
		await processStorageUploads(pg, provider)
		assert.strictEqual(calls.length, 1)
	})

	it('skips below the balance floor and keeps the local ref', async() => {
		const { id, doc } = await launch('STOD')
		const { provider, calls } = fakeProvider({ skip: 'balance below floor' })
		await processStorageUploads(pg, provider)
		assert.strictEqual(calls.length, 0)
		const row = await upload(id)
		assert.strictEqual(row.status, 'SKIPPED')
		assert.strictEqual((await creator(id)).terms_ref, doc.localRef)
		assert.strictEqual((await events(id)).length, 0)
	})

	it('retries with backoff, then fails after 3 attempts', async() => {
		const { id, doc } = await launch('STOE')
		const { provider, calls } = fakeProvider({ fail: true })
		for(let attempt = 1; attempt <= 3; attempt++) {
			await processStorageUploads(pg, provider)
			assert.strictEqual((await upload(id)).attempts, attempt)
			// Backoff: not due again until next_attempt_at passes.
			await processStorageUploads(pg, provider)
			assert.strictEqual(calls.length, attempt)
			await db.query(
				'UPDATE storage_uploads SET next_attempt_at = now() WHERE creator_id = $1', [id],
			)
		}

		assert.strictEqual((await upload(id)).status, 'FAILED')
		assert.strictEqual((await creator(id)).terms_ref, doc.localRef)
	})
})
