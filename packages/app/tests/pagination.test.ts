import type { PGlite } from '@electric-sql/pglite'
import assert from 'node:assert'
import { after, before, describe, it } from 'node:test'
import { createSeededPglite } from './pglite.ts'

const OWNER = '0x00000000000000000000000000000000000000a1'
const BUYER = '0x00000000000000000000000000000000000000b1'

type Page = {
	items: { ticker?: string, seq?: number }[]
	next: { key: string, id: string } | null
}

let db: PGlite

before(async() => {
	db = await createSeededPglite()
	await db.exec('SET search_path TO smx, public')
	// Five creators, raised 500, 400, 400, 100, 0. The tie breaks by ticker.
	const raised = { PAGA: 500, PAGB: 400, PAGC: 400, PAGD: 100, PAGE: 0 }
	let n = 0
	for(const [ticker, amount] of Object.entries(raised)) {
		n++
		const { rows: [u] } = await db.query<{ id: string }>(
			'INSERT INTO users(email, name) VALUES ($1, $2) RETURNING id',
			[`pg${n}@test.co`, `user ${n}`],
		)
		const { rows: [c] } = await db.query<{ id: string }>(
			`SELECT id FROM launch_ipo($1, $2, $3, $3, '', 500, 60, 10000, 1000,
				$4, 'local:x', 'x', 296)`,
			[u.id, OWNER, ticker, String(9000 + n)],
		)
		if(amount) {
			await db.query(
				'SELECT record_investment($1, $2, $3)',
				[c.id, BUYER, amount],
			)
		}
	}
})
after(async() => {
	await db.close()
})

/** Walks every page of `sql` (params: ...fixed, key, id) and returns them. */
async function walk(sql: string, fixed: unknown[]) {
	const pages: Page[] = []
	let key: string | null = null
	let id: string | null = null
	do {
		const res: { rows: { j: Page }[] } = await db.query(
			sql,
			[...fixed, key, id],
		)
		const r = res.rows[0]
		pages.push(r.j)
		key = r.j.next?.key ?? null
		id = r.j.next?.id ?? null
	} while(key)

	return pages
}

const tickers = (pages: Page[]) => pages.flatMap(
	(p) => p.items.map((i) => i.ticker),
)

describe('keyset pagination', () => {
	it('pages creators in sort order with no gaps or repeats', async() => {
		const sql = 'SELECT creators_page_json($1, NULL, NULL, $2, $3, 2) AS j'
		const raised = await walk(sql, ['raised'])
		// Raised desc, then ticker: A (500), B and C (400), D (100), E (0).
		assert.deepStrictEqual(
			tickers(raised).filter((t) => t?.startsWith('PAG')),
			['PAGA', 'PAGB', 'PAGC', 'PAGD', 'PAGE'],
		)
		assert.ok(raised.length >= 3, 'more than one page')
		assert.strictEqual(raised.at(-1)!.next, null)

		const all = tickers(raised)
		assert.strictEqual(new Set(all).size, all.length)

		// Same set whatever the sort; each sort is a complete, repeat-free walk.
		for(const sort of ['trending', 'newest']) {
			const got = tickers(await walk(sql, [sort]))
			assert.deepStrictEqual([...got].sort(), [...all].sort(), sort)
		}

		// Newest is the reverse of launch order for the five new creators.
		const newest = tickers(await walk(sql, ['newest']))
			.filter((t) => t?.startsWith('PAG'))
		assert.deepStrictEqual(newest, ['PAGE', 'PAGD', 'PAGC', 'PAGB', 'PAGA'])
	})

	it('filters creators by search and status', async() => {
		const { rows: [r] } = await db.query<{ j: Page }>(
			`SELECT creators_page_json(
				'raised', 'live', 'pag_', NULL, NULL, 10
			) AS j`,
		)
		// "_" is a literal in the search, not a wildcard.
		assert.strictEqual(r.j.items.length, 0)
		const { rows: [s] } = await db.query<{ j: Page }>(
			`SELECT creators_page_json(
				'raised', 'live', 'pagb', NULL, NULL, 10
			) AS j`,
		)
		assert.deepStrictEqual(s.j.items.map((i) => i.ticker), ['PAGB'])
	})

	it('pages activity newest first and honors filters', async() => {
		const sql = 'SELECT activity_page_json($1, $2, $3, $4, 3) AS j'
		const pages = await walk(sql, [null, null])
		const seqs = pages.flatMap((p) => p.items.map((i) => i.seq!))
		assert.ok(seqs.length > 6)
		assert.ok(pages.length > 1)
		for(let i = 1; i < seqs.length; i++) {
			assert.ok(seqs[i] < seqs[i - 1], 'strictly descending seq')
		}

		const { rows: [total] } = await db.query<{ n: string }>(
			'SELECT count(*) AS n FROM oracle_events',
		)
		assert.strictEqual(seqs.length, Number(total.n))

		const invested = await walk(sql, ['INVESTED', 'PAGA'])
		assert.strictEqual(invested.flatMap((p) => p.items).length, 1)
	})

	it('pages creator sub-lists and 404s an unknown ticker', async() => {
		const { rows: [h] } = await db.query<{ j: Page }>(
			'SELECT creator_holders_page_json(\'PAGB\', NULL, NULL, 1) AS j',
		)
		assert.strictEqual(h.j.items.length, 1)
		assert.strictEqual(h.j.next, null)
		await assert.rejects(
			db.query('SELECT creator_trades_page_json(\'NOPE\', NULL, NULL, 1)'),
		)
	})
})
