import type { PGlite } from '@electric-sql/pglite'
import assert from 'node:assert'
import { after, before, describe, it } from 'node:test'
import {
	displayAmount,
	estimateSwap,
	percentToBps,
} from '../src/client/order-estimate.ts'
import { createSeededPglite } from './pglite.ts'

const OWNER = '0x00000000000000000000000000000000000000a1'
const BUYER = '0x00000000000000000000000000000000000000b1'

const POOL = { usdcReserve: '1000', tokenReserve: '1000', feeBps: 30 }

describe('estimateSwap known amm_swap outputs', () => {
	it('BUY 100 USDC on a 1000/1000 pool', () => {
		// Pinned from a real amm_swap(BUY, 100) on a 1000/1000 pool.
		const e = estimateSwap({
			side: 'BUY',
			amountIn: '100',
			pool: POOL,
			slippageBps: 100,
		})
		assert.ok(e.ok)
		assert.strictEqual(e.out, '90.661089388014913158')
		assert.strictEqual(e.fee, '0.3')
		assert.strictEqual(e.price, '1.103009027081243731')
		assert.strictEqual(e.spotPrice, '1')
		assert.strictEqual(e.minOut, '89.754478494134764026')
		assert.strictEqual(e.impactPct, '10.3009')
	})

	it('SELL 100 tokens truncates USDC to 6 decimals', () => {
		const e = estimateSwap({
			side: 'SELL',
			amountIn: '100',
			pool: POOL,
			slippageBps: 50,
		})
		assert.ok(e.ok)
		assert.strictEqual(e.out, '90.661089')
		assert.strictEqual(e.fee, '0.3')
		assert.strictEqual(e.price, '0.90661089')
		assert.strictEqual(e.minOut, '90.207783')
	})

	it('rejects empty, malformed, and dust amounts', () => {
		assert.deepStrictEqual(
			estimateSwap({ side: 'BUY', amountIn: '', pool: POOL }),
			{ ok: false, reason: 'empty' },
		)
		for(const bad of ['0', '-1', '1e3', 'abc', '1.0000000000000000001']) {
			assert.deepStrictEqual(
				estimateSwap({ side: 'BUY', amountIn: bad, pool: POOL }),
				{ ok: false, reason: 'invalid' },
			)
		}

		assert.deepStrictEqual(
			estimateSwap({
				side: 'SELL',
				amountIn: '0.000000000000000001',
				pool: POOL,
			}),
			{ ok: false, reason: 'too-small' },
		)
	})
})

describe('estimateSwap parity with the SQL function', () => {
	let db: PGlite
	before(async() => {
		db = await createSeededPglite()
		await db.exec('SET search_path TO smx, public')
	})
	after(async() => {
		await db.close()
	})

	it('matches amm_swap output and minOut is accepted', async() => {
		const { rows: [u] } = await db.query<{ id: string }>(
			`INSERT INTO users(email, name) VALUES ('est@test.co', 'est')
			 RETURNING id`,
		)
		const { rows: [c] } = await db.query<{ id: string }>(
			`SELECT id FROM launch_ipo($1, $2, 'ESTX', 'ESTX', '', 500, 60,
				10000, 1000,
				'9901', 'local:x', 'x', 296)`,
			[u.id, OWNER],
		)
		await db.query(
			'SELECT record_investment($1, $2, 777.123456)',
			[c.id, BUYER],
		)
		await db.query('SELECT close_raise($1)', [c.id])

		const poolOf = async() => {
			const { rows: [p] } = await db.query<{ usdc: string, tok: string }>(
				`SELECT usdc_reserve::text usdc, token_reserve::text tok
				 FROM pools WHERE creator_id = $1`,
				[c.id],
			)
			return { usdcReserve: p.usdc, tokenReserve: p.tok, feeBps: 30 }
		}

		for(const [side, amountIn] of [
			['BUY', '123.456789'],
			['SELL', '7.123456789012345678'],
			['BUY', '0.01'],
			['SELL', '33'],
		] as const) {
			const pool = await poolOf()
			const e = estimateSwap({ side, amountIn, pool, slippageBps: 50 })
			assert.ok(e.ok)
			// minOut must pass the SQL slippage guard, and out must be exact.
			const { rows: [t] } = await db.query<
				{ usdc_amount: string, token_amount: string, price: string }
			>(
				`SELECT usdc_amount::text, token_amount::text, price::text
				 FROM amm_swap($1, $2, $3, $4, $5)`,
				[c.id, BUYER, side, amountIn, e.minOut],
			)
			const got = side === 'BUY' ? t.token_amount : t.usdc_amount
			const trimmed = got.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')
			assert.strictEqual(e.out, trimmed)
			// Postgres rounds long divisions, so the stored price can differ past
			// ~15 decimals; `out` above is the exact contract.
			assert.strictEqual(
				Number(e.price).toFixed(12),
				Number(t.price).toFixed(12),
			)
		}
	})
})

describe('helpers', () => {
	it('percentToBps', () => {
		assert.strictEqual(percentToBps('0.5'), 50)
		assert.strictEqual(percentToBps('1.25'), 125)
		assert.strictEqual(percentToBps('50'), 5000)
		for(const bad of ['', '0', '51', '-1', 'x', '1.234']) {
			assert.strictEqual(percentToBps(bad), null)
		}
	})

	it('displayAmount', () => {
		assert.strictEqual(displayAmount('1234.5', 2, 6), '1,234.50')
		assert.strictEqual(displayAmount('0.1234567', 2, 6), '0.123456')
		assert.strictEqual(displayAmount('7', 0, 6), '7')
	})
})
