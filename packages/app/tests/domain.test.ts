/* eslint-disable @stylistic/max-len, unicorn/no-await-expression-member */
import type { PGlite } from '@electric-sql/pglite'
import assert from 'node:assert'
import { after, before, describe, it } from 'node:test'
import { createSeededPglite } from './pglite.ts'

const A = '0x00000000000000000000000000000000000000a1'
const B = '0x00000000000000000000000000000000000000b1'
const C = '0x00000000000000000000000000000000000000c1'
const D = '0x00000000000000000000000000000000000000d1'

let db: PGlite
let seq = 0

before(async() => {
	db = await createSeededPglite()
	await db.exec('SET search_path TO smx, public')
})
after(async() => {
	await db.close()
})

/**
 * Creates a user and a LIVE creator; returns the creator id and nullifier.
 * `invest > 0` also invests that much from D and closes the raise (tranche 0
 * released, trading open). `invest = 0` leaves the raise open.
 */
async function launch(
	ticker: string, raise = 10000, invest = 100, trancheBps: number[] = [2000, 4000, 4000],
) {
	const n = ++seq
	const nullifier = String(1000 + n)
	const { rows: [u] } = await db.query<{ id: string }>(
		'INSERT INTO users(email, name) VALUES ($1, $2) RETURNING id',
		[`u${n}@test.co`, `user ${n}`],
	)
	const { rows: [c] } = await db.query<{ id: string }>(
		`SELECT id FROM launch_ipo($1, $2, $3, $3, '', 500, 60, $4, 1000, $5,
			'local:x', 'x', 296, NULL, $6::int[])`,
		[u.id, A, ticker, raise, nullifier, trancheBps],
	)
	if(invest > 0) {
		await db.query('SELECT record_investment($1, $2, $3)', [c.id, D, invest])
		await db.query('SELECT close_raise($1)', [c.id])
	}

	return { id: c.id, nullifier, userId: u.id }
}

const supplyOk = async(id: string) => (await db.query<{ ok: boolean, supply: string }>(
	'SELECT ok, supply FROM token_supply_check($1)', [id],
)).rows[0]

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
		const { id } = await launch('AMMX', 10000, 0)
		await db.query('SELECT record_investment($1, $2, 1000)', [id, B])
		await assert.rejects(
			db.query('SELECT amm_swap($1, $2, \'BUY\', 10, 0)', [id, B]),
			/raise closes/,
		)
		await db.query('SELECT close_raise($1)', [id])
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
		const { id, nullifier, userId } = await launch('LIQD', 10000, 0)
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
		// Raise still open: nothing was released, so all 1000 raised is refunded.
		assert.strictEqual(sum('REFUND'), 1000)
		assert.strictEqual(sum('REFUND', B), 600)
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

	it('freezes the escrow in GRACE and unfreezes on a late approved proof', async() => {
		const { id } = await launch('FRZE')
		const jobs = async() => (await db.query<{ fn: string }>(
			`SELECT fn FROM chain_jobs WHERE creator_id = $1
			AND fn IN ('freezeEscrow', 'unfreezeEscrow') ORDER BY seq`, [id],
		)).rows.map((r) => r.fn)
		const events = async() => (await db.query<{ kind: string }>(
			`SELECT kind FROM oracle_events WHERE creator_id = $1
			AND kind IN ('ESCROW_FROZEN', 'ESCROW_UNFROZEN') ORDER BY created_at`,
			[id],
		)).rows.map((r) => r.kind)

		await db.query(
			`UPDATE creators SET next_proof_due_at = now() - interval '1 day'
			WHERE id = $1`, [id],
		)
		await db.query('SELECT * FROM sweep_deadlines()')
		assert.deepStrictEqual(await jobs(), ['freezeEscrow'])

		await audit(await proof(id, 'late-1', 5000), 5000)
		assert.deepStrictEqual(await jobs(), ['freezeEscrow', 'unfreezeEscrow'])
		assert.deepStrictEqual(await events(), ['ESCROW_FROZEN', 'ESCROW_UNFROZEN'])
	})
})

describe('raise close and tranche 0', () => {
	it('keeps tranche 0 locked until the raise closes, then resizes to the raise', async() => {
		const { id } = await launch('RCLS', 10000, 0)
		const tranches = async() => (await db.query<{ status: string, amount: string }>(
			'SELECT status, amount FROM tranches WHERE creator_id = $1 ORDER BY idx', [id],
		)).rows
		assert.deepStrictEqual((await tranches()).map((t) => t.status), ['LOCKED', 'LOCKED', 'LOCKED'])

		await db.query('SELECT record_investment($1, $2, 500)', [id, B])
		assert.strictEqual((await tranches())[0].status, 'LOCKED')
		await assert.rejects(
			db.query('SELECT submit_income_proof($1, \'bank\', \'early\', 5000, \'{}\', 0)', [id]),
			/not accepting proofs/,
		)

		await db.query('SELECT close_raise($1)', [id])
		const after = await tranches()
		assert.deepStrictEqual(after.map((t) => t.status), ['RELEASED', 'LOCKED', 'LOCKED'])
		assert.deepStrictEqual(after.map((t) => Number(t.amount)), [100, 200, 200])
		const { rows: ev } = await db.query(
			'SELECT 1 FROM oracle_events WHERE creator_id = $1 AND kind = \'TRANCHE_RELEASED\'', [id],
		)
		assert.strictEqual(ev.length, 1)
		// The round is closed for new money.
		await assert.rejects(
			db.query('SELECT record_investment($1, $2, 10)', [id, C]),
			/not open for investment/,
		)
	})

	it('closes by itself when the raise fills', async() => {
		const { id } = await launch('RFIL', 1000, 0)
		await db.query('SELECT record_investment($1, $2, 1000)', [id, B])
		const { rows: [t0] } = await db.query<{ status: string }>(
			'SELECT status FROM tranches WHERE creator_id = $1 AND idx = 0', [id],
		)
		assert.strictEqual(t0.status, 'RELEASED')
		await db.query('SELECT amm_swap($1, $2, \'BUY\', 10, 0)', [id, B])
	})
})

describe('token supply', () => {
	it('sum(holdings) + pool tokens = raised + seed after investments and swaps', async() => {
		const { id } = await launch('SUPP', 10000, 0)
		await db.query('SELECT record_investment($1, $2, 300)', [id, B])
		await db.query('SELECT record_investment($1, $2, 200)', [id, C])
		assert.strictEqual((await supplyOk(id)).ok, true)
		await db.query('SELECT close_raise($1)', [id])
		await db.query('SELECT amm_swap($1, $2, \'BUY\', 50, 0)', [id, B])
		await db.query('SELECT amm_swap($1, $2, \'SELL\', 40, 0)', [id, C])
		await db.query('SELECT amm_swap($1, $2, \'BUY\', 7.123456, 0)', [id, D])
		await db.query('SELECT amm_swap($1, $2, \'SELL\', 20.5, 0)', [id, B])
		const s = await supplyOk(id)
		assert.strictEqual(s.ok, true)
		// 500 raised + 1000 pool seed.
		assert.strictEqual(Number(s.supply), 1500)
		const { rows: [m] } = await db.query<{ j: { fundamentals: { supply: string } } }>(
			'SELECT creator_market_json($1) AS j', [id],
		)
		assert.strictEqual(Number(m.j.fundamentals.supply), 1500)
	})
})

describe('default refund', () => {
	it('pays escrow and stake to current holders pro rata, excluding the pool', async() => {
		const { id } = await launch('DREF', 10000, 0)
		await db.query('SELECT record_investment($1, $2, 600)', [id, B])
		await db.query('SELECT record_investment($1, $2, 400)', [id, C])
		await db.query('SELECT close_raise($1)', [id])
		// B sells 100 of its 600 into the pool; C buys 50 from the pool.
		await db.query('SELECT amm_swap($1, $2, \'SELL\', 100, 0)', [id, B])
		await db.query('SELECT amm_swap($1, $2, \'BUY\', 60, 0)', [id, D])
		await db.query('SELECT liquidate_creator($1)', [id])

		const { rows } = await db.query<{ kind: string, wallet: string, amount: string }>(
			'SELECT kind, wallet::TEXT, amount FROM payouts WHERE creator_id = $1', [id],
		)
		const sum = (kind: string) => rows.filter((r) => r.kind === kind)
			.reduce((a, r) => a + Number(r.amount), 0)
		// Raised 1000: tranche 0 (200) released, 800 locked -> refunded.
		assert.ok(Math.abs(sum('REFUND') - 800) < 1e-6)
		assert.ok(Math.abs(sum('SLASH') - 1000) < 1e-6)
		const { rows: bal } = await db.query<{ wallet: string, balance: string }>(
			'SELECT wallet::TEXT, balance FROM holdings WHERE creator_id = $1', [id],
		)
		const total = bal.reduce((a, r) => a + Number(r.balance), 0)
		for(const h of bal) {
			const got = rows.filter((r) => r.kind === 'REFUND' && r.wallet === h.wallet)
				.reduce((a, r) => a + Number(r.amount), 0)
			assert.ok(Math.abs(got - 800 * Number(h.balance) / total) < 1e-5)
		}

		// Only holders are paid: the pool is not a wallet.
		assert.deepStrictEqual(
			[...new Set(rows.map((r) => r.wallet))].sort(),
			bal.map((r) => r.wallet).sort(),
		)
	})
})

describe('term end', () => {
	it('completes at raise close + term, allows SELL not BUY, returns the stake', async() => {
		const { id } = await launch('TRMB')
		// Keep proofs current so only the term end is due.
		await db.query(
			'UPDATE creators SET next_proof_due_at = now() + interval \'4000 days\' WHERE id = $1', [id],
		)
		await db.query('SELECT * FROM sweep_deadlines(now() + interval \'1799 days\')')
		assert.strictEqual((await db.query<{ status: string }>(
			'SELECT status FROM creators WHERE id = $1', [id],
		)).rows[0].status, 'LIVE')

		const { rows: sw } = await db.query<{ transition: string }>(
			'SELECT transition FROM sweep_deadlines(now() + interval \'1801 days\')',
		)
		assert.deepStrictEqual(sw.map((r) => r.transition), ['COMPLETED'])
		const { rows: ev } = await db.query<{ payload: { amount: string } }>(
			'SELECT payload FROM oracle_events WHERE creator_id = $1 AND kind = \'STAKE_RETURNED\'', [id],
		)
		assert.strictEqual(Number(ev[0].payload.amount), 1000)
		const { rows: job } = await db.query(
			'SELECT 1 FROM chain_jobs WHERE creator_id = $1 AND fn = \'reclaimStake\'', [id],
		)
		assert.strictEqual(job.length, 1)

		await assert.rejects(
			db.query('SELECT amm_swap($1, $2, \'BUY\', 10, 0)', [id, D]),
			/only selling/,
		)
		await db.query('SELECT amm_swap($1, $2, \'SELL\', 10, 0)', [id, D])
		assert.strictEqual((await supplyOk(id)).ok, true)

		const { rows: [m] } = await db.query<{ s: { kind: string, label: string, tradingHalted: boolean } }>(
			'SELECT creator_market_json($1) -> \'status\' AS s', [id],
		)
		assert.strictEqual(m.s.label, 'Term ended: sell only')
		assert.strictEqual(m.s.tradingHalted, false)
	})
})

describe('audit rejection', () => {
	it('stores the auditor reasoning as the reject reason', async() => {
		const { id } = await launch('RJCT')
		const p = await proof(id, 'rj0', 5000, 0)
		const { rows: [r] } = await db.query<{ audit: { reason: string } }>(
			`SELECT audit FROM audit_income_proof($1, 5000,
				'{"approved":false,"reasoning":"Deposit is outside the period"}')`, [p],
		)
		assert.strictEqual(r.audit.reason, 'Deposit is outside the period')
	})
})

describe('frozen trading', () => {
	it('halts BUY and SELL in GRACE', async() => {
		const { id } = await launch('HALT')
		await db.query('UPDATE creators SET next_proof_due_at = now() - interval \'1 day\' WHERE id = $1', [id])
		await db.query('SELECT * FROM sweep_deadlines()')
		await assert.rejects(db.query('SELECT amm_swap($1, $2, \'SELL\', 1, 0)', [id, D]), /frozen/)
		await assert.rejects(db.query('SELECT amm_swap($1, $2, \'BUY\', 1, 0)', [id, D]), /frozen/)
	})
})

describe('unpaid dividend', () => {
	it('enters grace after a cadence unpaid, and paying cures it', async() => {
		const { id } = await launch('UNPD')
		const p = await proof(id, 'u0', 5000, 0)
		await audit(p, 5000)
		const status = async() => (await db.query<{ status: string }>(
			'SELECT status FROM creators WHERE id = $1', [id],
		)).rows[0].status

		// Proof deadline is ~60 days out; the dividend is 31 days old.
		await db.query('SELECT * FROM sweep_deadlines(now() + interval \'29 days\')')
		assert.strictEqual(await status(), 'LIVE')
		const { rows: sw } = await db.query<{ transition: string }>(
			`SELECT transition FROM sweep_deadlines(now() + interval '31 days')
			WHERE creator_id = $1`, [id],
		)
		assert.deepStrictEqual(sw.map((r) => r.transition), ['GRACE'])
		const { rows: [f] } = await db.query<{ payload: { reason: string } }>(
			'SELECT payload FROM oracle_events WHERE creator_id = $1 AND kind = \'ESCROW_FROZEN\'', [id],
		)
		assert.strictEqual(f.payload.reason, 'Dividend unpaid')

		await db.query(
			'SELECT pay_dividend(id) FROM dividends WHERE creator_id = $1', [id],
		)
		assert.strictEqual(await status(), 'LIVE')
		const { rows: un } = await db.query(
			'SELECT 1 FROM oracle_events WHERE creator_id = $1 AND kind = \'ESCROW_UNFROZEN\'', [id],
		)
		assert.strictEqual(un.length, 1)
	})

	it('does not flag a dividend that was paid', async() => {
		const { id } = await launch('PAID')
		await audit(await proof(id, 'p0', 5000, 0), 5000)
		await db.query('SELECT pay_dividend(id) FROM dividends WHERE creator_id = $1', [id])
		const { rows } = await db.query(
			'SELECT * FROM sweep_deadlines(now() + interval \'31 days\') WHERE creator_id = $1', [id],
		)
		assert.strictEqual(rows.length, 0)
	})
})

describe('close raise', () => {
	it('rejects a non-owner, then closes: tranche 0 released, job queued', async() => {
		const { id, userId } = await launch('CLOS', 10000, 0)
		await db.query('SELECT record_investment($1, $2, 250)', [id, D])
		const { rows: [other] } = await db.query<{ id: string }>(
			'INSERT INTO users(email, name) VALUES (\'other@test.co\', \'other\') RETURNING id',
		)
		await assert.rejects(
			db.query('SELECT close_raise($1, $2)', [id, other.id]),
			/Only the creator can close the raise|Only the creator can do this/,
		)
		await db.query('SELECT close_raise($1, $2)', [id, userId])
		const { rows: [t0] } = await db.query<{ status: string, amount: string }>(
			'SELECT status, amount FROM tranches WHERE creator_id = $1 AND idx = 0', [id],
		)
		assert.strictEqual(t0.status, 'RELEASED')
		assert.ok(Number(t0.amount) > 0)
		const { rows: jobs } = await db.query(
			'SELECT 1 FROM chain_jobs WHERE creator_id = $1 AND fn = \'closeRaise\'', [id],
		)
		assert.strictEqual(jobs.length, 1)
		await assert.rejects(
			db.query('SELECT close_raise($1, $2)', [id, userId]), /not open/,
		)
	})
})

describe('single tranche (no escrow milestones)', () => {
	it('releases everything at close; an approved proof still pays a dividend', async() => {
		const { id } = await launch('ONE', 10000, 0, [10000])
		await db.query('SELECT record_investment($1, $2, 400)', [id, D])
		await db.query('SELECT close_raise($1)', [id])
		const { rows: tr } = await db.query<{ status: string, amount: string }>(
			'SELECT status, amount FROM tranches WHERE creator_id = $1', [id],
		)
		assert.deepStrictEqual(tr.map((t) => t.status), ['RELEASED'])
		assert.strictEqual(Number(tr[0].amount), 400)

		const p0 = await proof(id, 'one0', 5000, 0)
		assert.strictEqual((await audit(p0, 5000)).rows[0].status, 'APPROVED')
		const { rows: [d] } = await db.query<{ amount_due: string }>(
			'SELECT amount_due FROM dividends WHERE creator_id = $1', [id],
		)
		assert.strictEqual(Number(d.amount_due), 250)
		const { rows: ev } = await db.query(
			'SELECT 1 FROM oracle_events WHERE creator_id = $1 AND kind = \'TRANCHE_RELEASED\'', [id],
		)
		assert.strictEqual(ev.length, 1) // close only; the proof releases nothing more

		// Default: no locked escrow, so only the stake is slashed.
		await db.query('SELECT liquidate_creator($1)', [id])
		const { rows: pay } = await db.query<{ kind: string }>(
			'SELECT kind FROM payouts WHERE creator_id = $1', [id],
		)
		assert.deepStrictEqual([...new Set(pay.map((r) => r.kind))], ['SLASH'])
	})

	it('rejects empty, six-entry and zero-entry schedules', async() => {
		await assert.rejects(launch('BAD0', 10000, 0, [0]), /1 to 5 tranches/)
		await assert.rejects(
			launch('BAD6', 10000, 0, [2000, 2000, 2000, 2000, 1000, 1000]), /1 to 5 tranches/,
		)
		await assert.rejects(launch('BAD1', 10000, 0, []), /1 to 5 tranches/)
	})
})
