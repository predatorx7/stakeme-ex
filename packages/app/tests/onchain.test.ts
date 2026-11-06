/* eslint-disable @stylistic/max-len */
import type { PGlite } from '@electric-sql/pglite'
import { creatorPoolAbi, liquidISAAbi } from '@stakeme/contracts'
import assert from 'node:assert'
import { after, before, describe, it } from 'node:test'
import {
	encodeAbiParameters,
	encodeEventTopics,
	getAddress,
	type Hex,
	type Log,
} from 'viem'
import { checkReceipt, decodeInvestReceipt } from '../src/integrations/chain.ts'
import { createSeededPglite } from './pglite.ts'

const A = '0x00000000000000000000000000000000000000a1'
const B = '0x00000000000000000000000000000000000000b1'
const POOL = '0x00000000000000000000000000000000000000c1'
const ISA = '0x00000000000000000000000000000000000000d1'
const hash = (n: number) => `0x${n.toString(16).padStart(64, '0')}`
const USDC = 10n ** 6n
const ONE = 10n ** 18n

let db: PGlite
let creator: string

before(async() => {
	db = await createSeededPglite()
	await db.exec('SET search_path TO smx, public')
	const { rows: [u] } = await db.query<{ id: string }>(
		'INSERT INTO users(email, name) VALUES (\'o@test.co\', \'o\') RETURNING id',
	)
	const { rows: [c] } = await db.query<{ id: string }>(
		`SELECT id FROM launch_ipo($1, $2, 'ONCH', 'ONCH', '', 500, 60, 1000, 1000, '777',
			'local:x', 'x', 296)`,
		[u.id, A],
	)
	creator = c.id
})
after(async() => {
	await db.close()
})

/** Mirrors `CreatorPool._out`. */
const out = (amountIn: bigint, rIn: bigint, rOut: bigint) => {
	const eff = amountIn * 9970n
	return rOut * eff / (rIn * 10_000n + eff)
}

const swap = (q: string, params: unknown[]) => db.query<{ j: Record<string, string> }>(
	`SELECT trade_json(t) AS j FROM ingest_onchain_swap($1, $2, $3, ${q}) t`,
	[creator, ...params],
)

const supply = async() => {
	const { rows: [row] } = await db.query<{ ok: boolean }>(
		'SELECT ok FROM token_supply_check($1)', [creator],
	)
	return row.ok
}

describe('onchain ingest', () => {
	it('records an investment that fills the raise and seeds the pool', async() => {
		// Fills the 1,000 target; the pool seed is 100 USDC and 100 tokens.
		const args = [creator, A, hash(1), 1000n * USDC, 1000n * ONE, true, 100n * USDC, 100n * ONE]
		const { rows: [first] } = await db.query<{ id: string }>(
			'SELECT id FROM ingest_onchain_invest($1, $2, $3, $4, $5, $6, $7, $8)',
			args.map(String),
		)
		const { rows: [again] } = await db.query<{ id: string }>(
			'SELECT id FROM ingest_onchain_invest($1, $2, $3, $4, $5, $6, $7, $8)',
			args.map(String),
		)
		assert.strictEqual(again.id, first.id)
		const { rows: [c] } = await db.query<{ raised_amount: string, closed: boolean }>(
			'SELECT raised_amount, raise_closed_at IS NOT NULL AS closed FROM creators WHERE id = $1',
			[creator],
		)
		assert.strictEqual(Number(c.raised_amount), 1000)
		assert.ok(c.closed)
		const { rows: [n] } = await db.query<{ n: number }>(
			'SELECT count(*)::INT AS n FROM investments WHERE creator_id = $1', [creator],
		)
		assert.strictEqual(n.n, 1)
		assert.ok(await supply())
	})

	it('records exact swap amounts, once per tx hash', async() => {
		let usdcR = 100n * USDC
		let tokenR = 100n * ONE
		const usdcIn = 10n * USDC
		const tokensOut = out(usdcIn, usdcR, tokenR)
		usdcR += usdcIn
		tokenR -= tokensOut
		const params = [
			B, hash(2), String(usdcIn), '0', '0', String(tokensOut), String(usdcR), String(tokenR),
		]
		const q = '$4, $5, $6, $7, $8, $9'
		const { rows: [buy] } = await swap(q, params)
		assert.strictEqual(buy.j.side, 'BUY')
		assert.strictEqual(buy.j.usdcAmount, '10.000000')
		assert.strictEqual(
			buy.j.tokenAmount.replace('.', '').replace(/^0+/, ''),
			String(tokensOut),
		)
		const { rows: [replay] } = await swap(q, params)
		assert.strictEqual(replay.j.id, buy.j.id)
		const { rows: [n] } = await db.query<{ n: number }>(
			'SELECT count(*)::INT AS n FROM trades WHERE creator_id = $1', [creator],
		)
		assert.strictEqual(n.n, 1)
		const { rows: [pool] } = await db.query<{ u: string, t: string }>(
			'SELECT (usdc_reserve * 1e6)::NUMERIC(60, 0)::TEXT AS u, (token_reserve * 1e18)::NUMERIC(60, 0)::TEXT AS t FROM pools WHERE creator_id = $1',
			[creator],
		)
		assert.strictEqual(pool.u, String(usdcR))
		assert.strictEqual(pool.t, String(tokenR))
		assert.ok(await supply())

		// Sell half of what B bought back into the pool.
		const tokensIn = tokensOut / 2n
		const usdcOut = out(tokensIn, tokenR, usdcR)
		usdcR -= usdcOut
		tokenR += tokensIn
		const { rows: [sell] } = await swap(q, [
			B, hash(3), '0', String(tokensIn), String(usdcOut), '0', String(usdcR), String(tokenR),
		])
		assert.strictEqual(sell.j.side, 'SELL')
		assert.ok(await supply())
	})

	it('rejects a replayed hash from another wallet', async() => {
		await assert.rejects(swap('$4, $5, $6, $7, $8, $9', [
			A, hash(2), '1000000', '0', '0', '1', '1000000', '1',
		]))
	})
})

describe('receipt checks', () => {
	const ok = { status: 'success', to: ISA, from: A, logs: [] as Log[] }

	it('accepts a matching receipt', () => {
		assert.deepStrictEqual(checkReceipt(ok, { to: ISA, from: A }), [])
	})

	it('rejects a wrong target, wrong sender or failed status', () => {
		assert.throws(() => checkReceipt(ok, { to: POOL, from: A }), /different contract/)
		assert.throws(() => checkReceipt(ok, { to: ISA, from: B }), /different wallet/)
		assert.throws(
			() => checkReceipt({ ...ok, status: 'reverted' }, { to: ISA, from: A }),
			/failed onchain/,
		)
		assert.throws(
			() => checkReceipt({ ...ok, to: null }, { to: ISA, from: A }),
			/different contract/,
		)
	})

	it('decodes Invested, RaiseClosed and Seeded from the right contracts', () => {
		const topicsInvested = encodeEventTopics({
			abi: liquidISAAbi, eventName: 'Invested', args: { investor: A },
		}) as Hex[]
		const logs = [
			{
				address: getAddress(ISA),
				topics: topicsInvested,
				data: encodeAbiParameters(
					[{ type: 'uint256' }, { type: 'uint256' }],
					[5n * USDC, 5n * ONE],
				),
			},
			{
				address: getAddress(ISA),
				topics: encodeEventTopics({ abi: liquidISAAbi, eventName: 'RaiseClosed' }) as Hex[],
				data: encodeAbiParameters([{ type: 'uint256' }], [5n * USDC]),
			},
			{
				address: getAddress(POOL),
				topics: encodeEventTopics({ abi: creatorPoolAbi, eventName: 'Seeded' }) as Hex[],
				data: encodeAbiParameters(
					[{ type: 'uint256' }, { type: 'uint256' }],
					[100n * USDC, 100n * ONE],
				),
			},
		] as unknown as Log[]
		const inv = decodeInvestReceipt(logs, { isa: ISA, pool: POOL, investor: A })
		assert.strictEqual(inv.usdc, 5n * USDC)
		assert.strictEqual(inv.shares, 5n * ONE)
		assert.ok(inv.raiseClosed)
		assert.deepStrictEqual(inv.seeded, { usdc: 100n * USDC, tokens: 100n * ONE })
		// Same events from a different ISA address are ignored.
		assert.throws(
			() => decodeInvestReceipt(logs, { isa: B, pool: POOL, investor: A }),
			/no investment/,
		)
		assert.throws(
			() => decodeInvestReceipt(logs, { isa: ISA, pool: POOL, investor: B }),
			/different wallet/,
		)
	})
})
