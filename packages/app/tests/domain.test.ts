/* eslint-disable @stylistic/max-len, unicorn/no-await-expression-member */
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

/** Creates a user and a LIVE creator; returns the creator id and nullifier. */
async function launch(ticker: string, raise = 10000) {
	const n = ++seq
	const nullifier = String(1000 + n)
	const { rows: [u] } = await db.query<{ id: string }>(
		'INSERT INTO users(email, name) VALUES ($1, $2) RETURNING id',
		[`u${n}@test.co`, `user ${n}`],
	)
	const { rows: [c] } = await db.query<{ id: string }>(
		`SELECT id FROM launch_ipo($1, $2, $3, $3, '', 500, 60, $4, 1000, $5,
			'local:x', 'x', 296)`,
		[u.id, A, ticker, raise, nullifier],
	)
	return { id: c.id, nullifier, userId: u.id }
}

async function proof(creator: string, ref: string, amount: number, period?: number) {
	const { rows: [p] } = await db.query<{ id: string }>(
		'SELECT id FROM submit_income_proof($1, \'bank\', $2, $3, \'{}\', $4)',
		[creator, ref, amount, period ?? null],
	)
	return p.id
}

const audit = (id: string, amount: number) => db.query<{ status: string }>(
	'SELECT status FROM audit_income_proof($1, $2, \'{"approved":true}\')',
	[id, amount],
)

describe('income proofs and dividends', () => {
	it('approves, computes a 5% dividend, releases a tranche, rejects a duplicate period', async() => {
		const { id } = await launch('DIVA')
		const p0 = await proof(id, 'r0', 5000, 0)
		assert.strictEqual((await audit(p0, 5000)).rows[0].status, 'APPROVED')

		const { rows: [d] } = await db.query<{ amount_due: string }>(
			'SELECT amount_due FROM dividends WHERE creator_id = $1', [id],
		)
		assert.strictEqual(Number(d.amount_due), 250)

		const { rows: tr } = await db.query<{ idx: number, status: string }>(
			'SELECT idx, status FROM tranches WHERE creator_id = $1 ORDER BY idx',
			[id],
		)
		assert.deepStrictEqual(tr.map((t) => t.status), ['RELEASED', 'RELEASED', 'LOCKED'])

		// Same period again: stored, but the rules engine rejects it.
		const dup = await proof(id, 'r0b', 5000, 0)
		const { rows: [r] } = await db.query<{ status: string }>(
			'SELECT status FROM audit_income_proof($1, 5000, \'{}\')', [dup],
		)
		assert.strictEqual(r.status, 'REJECTED')
		const { rows: divs } = await db.query(
			'SELECT 1 FROM dividends WHERE creator_id = $1', [id],
		)
		assert.strictEqual(divs.length, 1)

		// Below the 1000 USDC minimum.
		const low = await proof(id, 'r1', 500)
		assert.strictEqual((await audit(low, 500)).rows[0].status, 'REJECTED')
	})
})

describe('amm_swap', () => {
	it('keeps x*y=k (plus fee), guards slippage, rejects DEFAULTED', async() => {
		const { id } = await launch('AMMX')
		await db.query('SELECT record_investment($1, $2, 1000)', [id, B])
		const pool = async() => (await db.query<{ u: string, t: string }>(
			'SELECT usdc_reserve u, token_reserve t FROM pools WHERE creator_id = $1',
			[id],
		)).rows[0]
		const before = await pool()
		const { rows: [t] } = await db.query<{ token_amount: string }>(
			'SELECT token_amount FROM amm_swap($1, $2, \'BUY\', 100, 0)', [id, B],
		)
		const after = await pool()
		// Seed is max(10% of 10000, 100) = 1000 on both sides.
		const eff = 100 * 0.997
		const expected = 1000 * eff / (1000 + eff)
		assert.ok(Math.abs(Number(t.token_amount) - expected) < 1e-9)
		assert.ok(Number(after.u) * Number(after.t) >= Number(before.u) * Number(before.t))

		await assert.rejects(
			db.query('SELECT amm_swap($1, $2, \'BUY\', 100, 1000)', [id, B]),
			/Slippage/,
		)
		await assert.rejects(
			db.query('SELECT amm_swap($1, $2, \'SELL\', 1000000, 0)', [id, C]),
			/Insufficient token balance/,
		)

		await db.query('SELECT demo_trigger_default($1)', ['AMMX'])
		await assert.rejects(
			db.query('SELECT amm_swap($1, $2, \'BUY\', 10, 0)', [id, B]),
			/defaulted/,
		)
	})
})

describe('liquidation', () => {
	it('refunds locked escrow, slashes the stake, blacklists the nullifier', async() => {
		const { id, nullifier, userId } = await launch('LIQD')
		await db.query('SELECT record_investment($1, $2, 600)', [id, B])
		await db.query('SELECT record_investment($1, $2, 400)', [id, C])
		await db.query('SELECT liquidate_creator($1)', [id])

		const { rows } = await db.query<{ kind: string, wallet: string, amount: string }>(
			'SELECT kind, wallet::TEXT, amount FROM payouts WHERE creator_id = $1',
			[id],
		)
		const sum = (kind: string, w?: string) => rows
			.filter((r) => r.kind === kind && (!w || r.wallet === w))
			.reduce((a, r) => a + Number(r.amount), 0)
		// Raise is fully subscribed (1000 of 10000 -> 10%): locked 8000 x 10%.
		assert.strictEqual(sum('REFUND'), 800)
		assert.strictEqual(sum('REFUND', B), 480)
		// Stake of 1000 slashed 60/40 by holdings.
		assert.strictEqual(sum('SLASH', B), 600)
		assert.strictEqual(sum('SLASH', C), 400)

		const { rows: [bl] } = await db.query(
			'SELECT 1 FROM blacklisted_nullifiers WHERE nullifier = $1', [nullifier],
		)
		assert.ok(bl)
		const { rows: [s] } = await db.query<{ status: string }>(
			'SELECT status FROM creators WHERE id = $1', [id],
		)
		assert.strictEqual(s.status, 'DEFAULTED')

		// The same human can't IPO again.
		const { rows: [u2] } = await db.query<{ id: string }>(
			'INSERT INTO users(email, name) VALUES (\'again@test.co\', \'x\') RETURNING id',
		)
		await assert.rejects(
			db.query(
				`SELECT launch_ipo($1, $2, 'AGAIN', 'x', '', 500, 60, 1000, 100, $3,
					'k', 'h', 296)`,
				[u2.id, A, nullifier],
			),
			/blacklisted/,
		)
		assert.ok(userId)
	})
})

describe('sweep_deadlines', () => {
	it('moves LIVE to GRACE to DEFAULTED', async() => {
		const { id } = await launch('SWEP')
		const status = async() => (await db.query<{ status: string }>(
			'SELECT status FROM creators WHERE id = $1', [id],
		)).rows[0].status
		assert.strictEqual(await status(), 'LIVE')

		await db.query(
			`UPDATE creators SET next_proof_due_at = now() - interval '1 day'
			WHERE id = $1`, [id],
		)
		await db.query('SELECT * FROM sweep_deadlines()')
		assert.strictEqual(await status(), 'GRACE')

		// Inside the 14-day grace window nothing happens.
		await db.query('SELECT * FROM sweep_deadlines(now() + interval \'13 days\')')
		assert.strictEqual(await status(), 'GRACE')

		await db.query('SELECT * FROM sweep_deadlines(now() + interval \'15 days\')')
		assert.strictEqual(await status(), 'DEFAULTED')
	})
})
