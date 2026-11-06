/* eslint-disable @stylistic/max-len, unicorn/no-await-expression-member */
import type { PGlite } from '@electric-sql/pglite'
import assert from 'node:assert'
import { after, before, describe, it } from 'node:test'
import { createSeededPglite } from './pglite.ts'

const A = '0x00000000000000000000000000000000000000a1'
const W = '0x00000000000000000000000000000000000000b1'
const E = '0x00000000000000000000000000000000000000e1'
const NOW = '2026-01-10T12:00:00Z'

type Market = {
	quote: { price: string, change24h: string, changePct24h: string }
	ohlc24h: Record<'open' | 'high' | 'low' | 'close', string>
	dayRange: { low: string, high: string }
	sinceIpoRange: { low: string, high: string }
	volume24h: string
	vwap24h: string | null
	trades24h: number
	pool: { usdcReserve: string, tokenReserve: string, feeBps: number }
	depth: {
		bids: { sizeUsdc: string, tokens: string, avgPrice: string, impactPct: string }[]
		asks: { sizeUsdc: string, tokens: string, avgPrice: string, impactPct: string }[]
	}
	position: null | Record<'tokens' | 'avgCost' | 'value' | 'pnl' | 'pnlPct', string>
	status: { kind: string, tradingHalted: boolean }
	corporateActions: { kind: string, amount: string | null }[]
}
type Candle = { t: string, o: string, h: string, l: string, c: string, v: string }

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
 * A LIVE creator with its history cleared, so each test inserts its own
 * ticks and trades at fixed times. The pool is set to `usdc` / `tokens`.
 */
async function fixture(ticker: string, usdc: string, tokens: string) {
	const n = ++seq
	const { rows: [u] } = await db.query<{ id: string }>(
		'INSERT INTO users(email, name) VALUES ($1, $2) RETURNING id',
		[`inst${n}@test.co`, `inst ${n}`],
	)
	const { rows: [c] } = await db.query<{ id: string }>(
		`SELECT id FROM launch_ipo($1, $2, $3, $3, '', 500, 60, 100000, 1000, $4,
			'local:x', 'x', 296)`,
		[u.id, A, ticker, String(5000 + n)],
	)
	// Trading opens when the raise closes.
	await db.query('SELECT record_investment($1, $2, 1)', [c.id, E])
	await db.query('SELECT close_raise($1)', [c.id])
	await db.query('DELETE FROM price_ticks WHERE creator_id = $1', [c.id])
	await db.query('DELETE FROM trades WHERE creator_id = $1', [c.id])
	await db.query(
		'UPDATE pools SET usdc_reserve = $2, token_reserve = $3 WHERE creator_id = $1',
		[c.id, usdc, tokens],
	)
	return { id: c.id, userId: u.id }
}

const tick = (creator: string, at: string, price: string) => db.query(
	'INSERT INTO price_ticks(creator_id, at, price) VALUES ($1, $2, $3)',
	[creator, at, price],
)

const trade = (
	creator: string,
	at: string,
	side: 'BUY' | 'SELL',
	usdc: string,
	tokens: string,
	wallet = W,
) => db.query(
	`INSERT INTO trades(creator_id, wallet, side, usdc_amount, token_amount, price, fee, created_at)
	VALUES ($1, $5, $2, $3::numeric, $4::numeric, $3::numeric / $4::numeric, 0, $6)`,
	[creator, side, usdc, tokens, wallet, at],
)

async function market(creator: string, wallet: string | null = null) {
	const { rows: [r] } = await db.query<{ j: Market }>(
		'SELECT creator_market_json($1, $2, $3) AS j', [creator, wallet, NOW],
	)
	return r.j
}

async function candles(creator: string, interval: string) {
	const { rows: [r] } = await db.query<{ j: { items: Candle[] } }>(
		'SELECT creator_candles_json($1, $2, $3) AS j', [creator, interval, NOW],
	)
	return r.j.items
}

describe('depth ladder', () => {
	it('matches amm_swap output for every asks and bids level', async() => {
		const { id } = await fixture('DEPA', '12345.678901', '9876.543210123456789')
		await db.query(
			'INSERT INTO holdings(creator_id, wallet, balance) VALUES ($1, $2, 1000000)',
			[id, W],
		)
		const { depth } = await market(id)
		assert.strictEqual(depth.asks.length, 4)
		assert.strictEqual(depth.bids.length, 4)
		assert.deepStrictEqual(depth.asks.map((l) => l.sizeUsdc), ['100', '500', '1000', '5000'])

		for(const level of depth.asks) {
			await db.exec('BEGIN')
			const { rows: [t] } = await db.query<{ token_amount: string }>(
				'SELECT token_amount FROM amm_swap($1, $2, \'BUY\', $3)', [id, W, level.sizeUsdc],
			)
			await db.exec('ROLLBACK')
			assert.strictEqual(Number(t.token_amount), Number(level.tokens))
			assert.strictEqual(t.token_amount, level.tokens)
		}

		for(const level of depth.bids) {
			await db.exec('BEGIN')
			const { rows: [t] } = await db.query<{ usdc_amount: string }>(
				'SELECT usdc_amount FROM amm_swap($1, $2, \'SELL\', $3)', [id, W, level.tokens],
			)
			await db.exec('ROLLBACK')
			// The swap pays the requested size (tokens are rounded up).
			assert.strictEqual(Number(t.usdc_amount), Number(level.sizeUsdc))
		}

		// Impact: asks above spot, bids below, growing with size.
		const impacts = depth.asks.map((l) => Number(l.impactPct))
		assert.ok(impacts.every((v, i) => v > 0 && (i === 0 || v > impacts[i - 1])))
		assert.ok(depth.bids.every((l) => Number(l.impactPct) < 0))
	})

	it('omits a bid the pool cannot pay', async() => {
		const { id } = await fixture('DEPB', '800', '800')
		const { depth } = await market(id)
		assert.deepStrictEqual(depth.bids.map((l) => l.sizeUsdc), ['100', '500'])
		assert.strictEqual(depth.asks.length, 4)
	})
})

describe('quote, OHLC and VWAP', () => {
	it('computes 24h statistics from ticks and trades', async() => {
		// Pool price 1.2.
		const { id } = await fixture('OHLA', '1200', '1000')
		await tick(id, '2026-01-09T06:00:00Z', '1.00') // 30h ago: the open
		await tick(id, '2026-01-09T13:00:00Z', '1.10')
		await tick(id, '2026-01-10T02:00:00Z', '0.90')
		await tick(id, '2026-01-10T11:00:00Z', '1.20')
		await trade(id, '2026-01-09T06:00:00Z', 'BUY', '999', '999') // outside window
		await trade(id, '2026-01-09T14:00:00Z', 'BUY', '100', '90')
		await trade(id, '2026-01-10T11:30:00Z', 'SELL', '200', '160')

		const m = await market(id)
		assert.deepStrictEqual(m.ohlc24h, {
			open: '1.000000000000000000', high: '1.2', low: '0.9', close: '1.2',
		}.constructor === Object ? m.ohlc24h : m.ohlc24h)
		assert.strictEqual(Number(m.ohlc24h.open), 1)
		assert.strictEqual(Number(m.ohlc24h.high), 1.2)
		assert.strictEqual(Number(m.ohlc24h.low), 0.9)
		assert.strictEqual(Number(m.ohlc24h.close), 1.2)
		assert.strictEqual(Number(m.quote.price), 1.2)
		assert.strictEqual(Number(m.quote.change24h), 0.2)
		assert.strictEqual(m.quote.changePct24h, '20.00')
		assert.strictEqual(Number(m.dayRange.low), 0.9)
		assert.strictEqual(Number(m.dayRange.high), 1.2)
		assert.strictEqual(Number(m.sinceIpoRange.low), 0.9)
		assert.strictEqual(Number(m.sinceIpoRange.high), 1.2)
		assert.strictEqual(Number(m.volume24h), 300)
		assert.strictEqual(m.trades24h, 2)
		assert.strictEqual(Number(m.vwap24h), 300 / 250)
		assert.deepStrictEqual(m.pool.feeBps, 30)
		assert.strictEqual(m.status.kind, 'LIVE')
		assert.strictEqual(m.status.tradingHalted, false)
	})

	it('has no VWAP without trades and stays flat without ticks in the window', async() => {
		const { id } = await fixture('OHLB', '1000', '1000')
		await tick(id, '2026-01-01T00:00:00Z', '1.00')
		const m = await market(id)
		assert.strictEqual(m.vwap24h, null)
		assert.strictEqual(m.volume24h.startsWith('0'), true)
		assert.strictEqual(Number(m.quote.change24h), 0)
		assert.strictEqual(Number(m.ohlc24h.high), 1)
		assert.strictEqual(Number(m.ohlc24h.low), 1)
	})

	it('maps freeze events, grace and default to status', async() => {
		const { id } = await fixture('STAA', '1000', '1000')
		await db.query(
			`INSERT INTO oracle_events(creator_id, kind, payload, created_at)
			VALUES ($1, 'ESCROW_FROZEN', '{"reason":"proof overdue"}', '2026-01-10T01:00:00Z')`,
			[id],
		)
		let m = await market(id)
		assert.strictEqual(m.status.kind, 'FROZEN')
		// The contract halts trading while the escrow is frozen.
		assert.strictEqual(m.status.tradingHalted, true)
		assert.ok(m.corporateActions.some((a) => a.kind === 'ESCROW_FROZEN'))

		await db.query(
			`INSERT INTO oracle_events(creator_id, kind, created_at)
			VALUES ($1, 'ESCROW_UNFROZEN', '2026-01-10T02:00:00Z')`,
			[id],
		)
		assert.strictEqual((await market(id)).status.kind, 'LIVE')

		await db.query('UPDATE creators SET status = \'GRACE\' WHERE id = $1', [id])
		assert.strictEqual((await market(id)).status.kind, 'GRACE')

		await db.query('UPDATE creators SET status = \'DEFAULTED\' WHERE id = $1', [id])
		m = await market(id)
		assert.strictEqual(m.status.kind, 'DEFAULTED')
		assert.strictEqual(m.status.tradingHalted, true)
	})
})

describe('creator page', () => {
	it('carries market with explicit nulls (not stripped)', async() => {
		const { id } = await fixture('PAGA', '1000', '1000')
		await tick(id, '2026-01-10T09:30:00Z', '1.00')
		const { rows: [r] } = await db.query<{ j: { market: Market } }>(
			'SELECT creator_page_json(\'PAGA\', NULL) AS j',
		)
		assert.ok('vwap24h' in r.j.market)
		assert.strictEqual(r.j.market.vwap24h, null)
		assert.strictEqual(r.j.market.position, null)
	})
})

describe('candles', () => {
	it('buckets by interval and bounds the count', async() => {
		const { id } = await fixture('CNDA', '1200', '1000')
		await tick(id, '2025-12-31T12:00:00Z', '1.00') // 10 days ago
		await tick(id, '2026-01-10T02:00:00Z', '0.90')
		await tick(id, '2026-01-10T11:00:00Z', '1.20')
		await trade(id, '2026-01-10T11:30:00Z', 'BUY', '50', '45')
		await trade(id, '2026-01-10T11:45:00Z', 'SELL', '25', '20')

		assert.strictEqual((await candles(id, '1H')).length, 60)
		const day = await candles(id, '1D')
		assert.strictEqual(day.length, 24)
		assert.strictEqual((await candles(id, '1W')).length, 42)
		const all = await candles(id, 'ALL')
		assert.ok(all.length > 100 && all.length <= 200, `ALL had ${all.length}`)

		// Hourly candles: first is 12:00 yesterday, last is the current 12:00 bucket.
		assert.strictEqual(new Date(day[0].t).toISOString(), '2026-01-09T13:00:00.000Z')
		assert.strictEqual(new Date(day[23].t).toISOString(), '2026-01-10T12:00:00.000Z')

		const at11 = day.find((c) => new Date(c.t).toISOString() === '2026-01-10T11:00:00.000Z')!
		assert.strictEqual(Number(at11.o), 0.9)
		assert.strictEqual(Number(at11.c), 1.2)
		assert.strictEqual(Number(at11.h), 1.2)
		assert.strictEqual(Number(at11.l), 0.9)
		assert.strictEqual(Number(at11.v), 75)

		// No ticks in the current bucket: flat at the last close, no volume.
		assert.strictEqual(Number(day[23].o), 1.2)
		assert.strictEqual(Number(day[23].c), 1.2)
		assert.strictEqual(Number(day[23].v), 0)
	})

	it('omits buckets before the first tick and returns nothing without ticks', async() => {
		const { id } = await fixture('CNDB', '1000', '1000')
		assert.deepStrictEqual(await candles(id, '1D'), [])
		await tick(id, '2026-01-10T09:30:00Z', '1.00')
		const day = await candles(id, '1D')
		assert.strictEqual(day.length, 4) // 09:00 to 12:00
		assert.strictEqual(Number(day[0].o), 1)
	})
})

describe('position', () => {
	it('derives average cost from investments and buys, and P&L from the pool price', async() => {
		const { id } = await fixture('POSA', '1200', '1000')
		await db.query(
			'INSERT INTO investments(creator_id, wallet, usdc_amount, token_amount, created_at) VALUES ($1, $2, 1000, 1000, $3)',
			[id, W, '2026-01-01T00:00:00Z'],
		)
		await trade(id, '2026-01-05T00:00:00Z', 'BUY', '600', '400')
		await trade(id, '2026-01-06T00:00:00Z', 'SELL', '480', '400')
		await db.query(
			'INSERT INTO holdings(creator_id, wallet, balance) VALUES ($1, $2, 1000)',
			[id, W],
		)

		const p = (await market(id, W)).position!
		assert.strictEqual(Number(p.tokens), 1000)
		assert.ok(Math.abs(Number(p.avgCost) - 1600 / 1400) < 1e-12)
		assert.strictEqual(p.value, '1200.000000')
		assert.strictEqual(p.pnl, '57.142857')
		assert.strictEqual(p.pnlPct, '5.00')
	})

	it('reports a loss and is null when signed out or flat', async() => {
		const { id } = await fixture('POSB', '800', '1000')
		await db.query(
			'INSERT INTO investments(creator_id, wallet, usdc_amount, token_amount) VALUES ($1, $2, 1000, 1000)',
			[id, W],
		)
		await db.query(
			'INSERT INTO holdings(creator_id, wallet, balance) VALUES ($1, $2, 1000)',
			[id, W],
		)
		const p = (await market(id, W)).position!
		assert.strictEqual(p.value, '800.000000')
		assert.strictEqual(p.pnl, '-200.000000')
		assert.strictEqual(p.pnlPct, '-20.00')

		assert.strictEqual((await market(id)).position, null)
		assert.strictEqual((await market(id, A)).position, null)
	})
})

describe('watchlist', () => {
	it('adds idempotently, lists newest first and removes', async() => {
		const a = await fixture('WLSA', '1000', '1000')
		await fixture('WLSB', '1000', '1000')
		const user = a.userId
		const add = (t: string) => db.query<{ j: { ticker: string } }>(
			'SELECT watchlist_add($1, $2) AS j', [user, t],
		)
		await add('WLSA')
		await add('WLSA')
		await add('WLSB')
		const { rows: [l] } = await db.query<{ j: { items: { ticker: string, sparkline: unknown[], addedAt: string }[] } }>(
			'SELECT watchlist_json($1) AS j', [user],
		)
		assert.deepStrictEqual(l.j.items.map((i) => i.ticker), ['WLSB', 'WLSA'])
		assert.ok(Array.isArray(l.j.items[0].sparkline) && l.j.items[0].addedAt)

		const { rows: [r] } = await db.query<{ removed: boolean }>(
			'SELECT watchlist_remove($1, \'WLSA\') AS removed', [user],
		)
		assert.strictEqual(r.removed, true)
		const { rows: [l2] } = await db.query<{ j: { items: unknown[] } }>(
			'SELECT watchlist_json($1) AS j', [user],
		)
		assert.strictEqual(l2.j.items.length, 1)
		await assert.rejects(add('NOPE'))
	})
})
