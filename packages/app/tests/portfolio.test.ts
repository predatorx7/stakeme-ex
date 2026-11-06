/* eslint-disable @stylistic/max-len, unicorn/no-await-expression-member, @typescript-eslint/no-explicit-any */
import type { PGlite } from '@electric-sql/pglite'
import assert from 'node:assert'
import { after, before, describe, it } from 'node:test'
import { createSeededPglite } from './pglite.ts'
import { bootApp } from './utils.ts'

const OWNER = '0x00000000000000000000000000000000000000a2'
const W = '0x00000000000000000000000000000000000000b2'
const OTHER = '0x00000000000000000000000000000000000000c2'
const TX = `0x${'ab'.repeat(32)}`

let db: PGlite
let creatorId: string
let ownerId: string
let boughtTokens: number
let soldTokens: number

before(async() => {
	db = await createSeededPglite()
	await db.exec('SET search_path TO smx, public')
	const { rows: [u] } = await db.query<{ id: string }>(
		'INSERT INTO users(email, name) VALUES (\'pf@test.co\', \'pf\') RETURNING id',
	)
	ownerId = u.id
	const { rows: [c] } = await db.query<{ id: string }>(
		`SELECT id FROM launch_ipo($1, $2, 'PFLO', 'PFLO', '', 500, 60, 10000, 1000,
			'5001', 'local:x', 'x', 296)`,
		[ownerId, OWNER],
	)
	creatorId = c.id

	// Investment (1000 USDC), a buy (500 USDC), then a partial sell.
	await db.query('SELECT record_investment($1, $2, 1000)', [creatorId, W])
	await db.query('SELECT record_investment($1, $2, 50)', [creatorId, OTHER])
	await db.query('SELECT close_raise($1)', [creatorId])
	const { rows: [buy] } = await db.query<{ token_amount: string }>(
		'SELECT token_amount FROM amm_swap($1, $2, \'BUY\', 500, 0)',
		[creatorId, W],
	)
	boughtTokens = Number(buy.token_amount)
	soldTokens = 400
	await db.query(
		'SELECT amm_swap($1, $2, \'SELL\', $3, 0)', [creatorId, W, soldTokens],
	)

	// One approved income proof, paid out pro rata.
	const { rows: [p] } = await db.query<{ id: string }>(
		'SELECT id FROM submit_income_proof($1, \'bank\', \'r0\', 5000, \'{}\', 0)',
		[creatorId],
	)
	await db.query('SELECT audit_income_proof($1, 5000, \'{}\')', [p.id])
	const { rows: [d] } = await db.query<{ id: string }>(
		'SELECT id FROM dividends WHERE creator_id = $1', [creatorId],
	)
	await db.query('SELECT pay_dividend($1, $2, $3)', [d.id, TX, ownerId])
})
after(async() => {
	await db.close()
})

const portfolio = async(wallet: string, user: string | null = null) => (
	await db.query<{ j: Record<string, any> }>(
		'SELECT wallet_portfolio_json($1, $2) AS j', [wallet, user],
	)
).rows[0].j

describe('wallet_portfolio_json', () => {
	it('matches the token page position and sums the totals', async() => {
		const pf = await portfolio(W)
		const { rows: [m] } = await db.query<{ j: Record<string, any> }>(
			'SELECT creator_market_json($1, $2) AS j', [creatorId, W],
		)
		const pos = m.j.position
		assert.strictEqual(pf.holdings.length, 1)
		const [h] = pf.holdings
		assert.strictEqual(h.ticker, 'PFLO')
		assert.strictEqual(h.tokens, pos.tokens)
		assert.strictEqual(h.avgCost, pos.avgCost)
		assert.strictEqual(h.value, pos.value)
		assert.strictEqual(h.pnl, pos.pnl)
		assert.strictEqual(h.pnlPct, pos.pnlPct)

		// Independent check: weighted-average cost over investment and buy.
		const bought = 1000 + boughtTokens
		const avg = 1500 / bought
		const left = bought - soldTokens
		assert.ok(Math.abs(Number(h.tokens) - left) < 1e-4)
		assert.ok(Math.abs(Number(h.avgCost) - avg) < 1e-6)
		assert.ok(Math.abs(Number(pf.totals.invested) - left * avg) < 1e-3)
		assert.ok(
			Math.abs(
				Number(pf.totals.value) - Number(pf.totals.invested)
					- Number(pf.totals.pnl),
			) < 1e-3,
		)
		assert.strictEqual(pf.totals.value, h.value)
	})

	it('sums dividends received for the wallet only', async() => {
		const pf = await portfolio(W)
		const { rows: [po] } = await db.query<{ s: string }>(
			'SELECT sum(amount) AS s FROM payouts WHERE wallet = $1 AND kind = \'DIVIDEND\'',
			[W],
		)
		assert.ok(Number(po.s) > 0)
		assert.strictEqual(Number(pf.dividends.total), Number(po.s))
		assert.strictEqual(pf.dividends.count, 1)
		assert.strictEqual(pf.dividends.items[0].txHash, TX)
		assert.strictEqual(pf.dividends.items[0].ticker, 'PFLO')
		const none = await portfolio('0x00000000000000000000000000000000000000d2')
		assert.strictEqual(none.holdings.length, 0)
		assert.strictEqual(none.totals.invested, '0')
		assert.strictEqual(none.dividends.total, '0')
	})

	it('returns the owner\'s own IPO', async() => {
		assert.strictEqual((await portfolio(OWNER, ownerId)).creator.ticker, 'PFLO')
		assert.strictEqual((await portfolio(W)).creator, null)
	})
})

describe('wallet_transactions_json', () => {
	const page = async(key: string | null, id: string | null, limit: number) => (
		await db.query<{ j: Record<string, any> }>(
			'SELECT wallet_transactions_json($1, $2, $3, $4) AS j',
			[W, key, id, limit],
		)
	).rows[0].j

	it('pages newest first without gaps or repeats', async() => {
		const all = (await page(null, null, 100)).items
		assert.deepStrictEqual(
			all.map((t: { type: string }) => t.type).sort(),
			['BUY', 'INVESTMENT', 'SELL'],
		)
		const times = all.map((t: { createdAt: string }) => Date.parse(t.createdAt))
		assert.deepStrictEqual(times, [...times].sort((a, b) => b - a))

		const seen: string[] = []
		let key: string | null = null
		let id: string | null = null
		for(let i = 0; i < 5; i++) {
			const p = await page(key, id, 2)
			seen.push(...p.items.map((t: { id: string }) => t.id))
			if(!p.next) {
				break
			}

			;({ key, id } = p.next)
		}

		assert.deepStrictEqual(seen, all.map((t: { id: string }) => t.id))
	})
})

describe('GET /portfolio signed out', () => {
	it('shows a connect prompt in HTML and 401 in JSON', async() => {
		const app = await bootApp()
		try {
			const html = await app.fetch('/portfolio', {
				headers: { accept: 'text/html' },
			})
			assert.strictEqual(html.status, 200)
			assert.match(await html.text(), /Connect a wallet to see your portfolio/)
			const json = await app.fetch('/portfolio', {
				headers: { accept: 'application/json' },
			})
			assert.strictEqual(json.status, 401)
		} finally {
			await app.close()
		}
	})
})
