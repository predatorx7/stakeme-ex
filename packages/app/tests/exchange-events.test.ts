/* eslint-disable @stylistic/max-len */
import type { PGlite } from '@electric-sql/pglite'
import assert from 'node:assert'
import { after, before, describe, it } from 'node:test'
import { createSeededPglite } from './pglite.ts'

const A = '0x00000000000000000000000000000000000000a1'
const B = '0x00000000000000000000000000000000000000b1'
const C = '0x00000000000000000000000000000000000000c1'

let db: PGlite
let seq = 0

before(async() => {
	db = await createSeededPglite()
	await db.exec('SET search_path TO smx, public')
})
after(async() => {
	await db.close()
})

async function launch(ticker: string) {
	const n = ++seq
	const { rows: [u] } = await db.query<{ id: string }>(
		'INSERT INTO users(email, name) VALUES ($1, $2) RETURNING id',
		[`ev${n}@test.co`, `user ${n}`],
	)
	const { rows: [c] } = await db.query<{ id: string }>(
		`SELECT id FROM launch_ipo($1, $2, $3, $3, '', 500, 60, 10000, 1000, $4,
			'local:x', 'x', 296)`,
		[u.id, A, ticker, String(5000 + n)],
	)
	return c.id
}

async function totals() {
	const { rows: [r] } = await db.query<{ t: Record<string, string | number> }>(
		'SELECT exchange_json(1) -> \'totals\' AS t',
	)
	return r.t
}

describe('exchange_json totals', () => {
	it('counts every creator, not only trending or the latest events', async() => {
		const base = await totals()
		const one = await launch('TOTA')
		const two = await launch('TOTB')
		await db.query('SELECT record_investment($1, $2, 600)', [one, B])
		await db.query('SELECT record_investment($1, $2, 400)', [two, B])
		await db.query('SELECT record_investment($1, $2, 250)', [two, C])
		await db.query('SELECT close_raise($1)', [one])
		await db.query('SELECT close_raise($1)', [two])
		// Pay one dividend; an unpaid (DUE) one must not count.
		const { rows: [p] } = await db.query<{ id: string }>(
			'SELECT id FROM submit_income_proof($1, \'bank\', \'tot-1\', 5000, \'{}\', 0)', [one],
		)
		await db.query('SELECT audit_income_proof($1, 5000, \'{"approved":true}\')', [p.id])
		const { rows: [d] } = await db.query<{ id: string, amount_due: string }>(
			'SELECT id, amount_due FROM dividends WHERE creator_id = $1', [one],
		)
		const due = await totals()
		assert.strictEqual(Number(due.dividendsPaid), Number(base.dividendsPaid))
		await db.query('SELECT pay_dividend($1)', [d.id])

		const after = await totals()
		// limit 1 trending, yet totals span both creators.
		assert.strictEqual(
			Number(after.totalRaised) - Number(base.totalRaised), 1250,
		)
		assert.strictEqual(
			Number(after.activeCreators) - Number(base.activeCreators), 2,
		)
		assert.strictEqual(
			Number(after.dividendsPaid) - Number(base.dividendsPaid),
			Number(d.amount_due),
		)
		// B holds both creators but counts once; C is new. Creators' own wallet
		// holds nothing until it buys.
		assert.strictEqual(Number(after.holders) - Number(base.holders), 2)
	})
})

describe('oracle_events_since', () => {
	it('replays after the cursor, oldest first, bounded to the newest N', async() => {
		const id = await launch('REPL')
		const other = await launch('REPO')
		for(let i = 0; i < 6; i++) {
			await db.query('SELECT record_investment($1, $2, 1)', [id, B])
		}

		await db.query('SELECT record_investment($1, $2, 1)', [other, B])
		const since = async(
			cursor: number, creator: string | null, limit: number,
		) => {
			const { rows } = await db.query<{ seq: string, creator_id: string }>(
				'SELECT seq, creator_id FROM oracle_events_since($1, $2, $3)',
				[cursor, creator, limit],
			)
			return rows
		}

		const all = await since(0, id, 100)
		const seqs = all.map((r) => Number(r.seq))
		assert.ok(seqs.length >= 7) // IPO + 6 investments
		assert.deepStrictEqual(seqs, [...seqs].sort((a, b) => a - b))
		assert.ok(all.every((r) => r.creator_id === id))

		// Cursor is exclusive.
		const after = await since(seqs[2], id, 100)
		assert.deepStrictEqual(after.map((r) => Number(r.seq)), seqs.slice(3))

		// Bound keeps the newest events, still ascending.
		const bounded = await since(0, id, 3)
		assert.deepStrictEqual(bounded.map((r) => Number(r.seq)), seqs.slice(-3))

		// No creator filter spans creators.
		const every = await since(seqs[0] - 1, null, 1000)
		assert.ok(every.some((r) => r.creator_id === other))
	})
})
