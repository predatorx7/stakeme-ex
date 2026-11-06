/* eslint-disable @stylistic/max-len */
import type { PGlite } from '@electric-sql/pglite'
import { liquidISAAbi } from '@stakeme/contracts'
import assert from 'node:assert'
import { after, before, describe, it } from 'node:test'
import {
	encodeAbiParameters,
	encodeEventTopics,
	getAddress,
	type Hex,
	type Log,
} from 'viem'
import {
	checkReceipt,
	decodeClaimReceipt,
	decodeDividendReceipt,
} from '../src/integrations/chain.ts'
import {
	assertHbarRailConfigured,
	createHederaPaymentRequest,
} from '../src/services/payment/hedera-payment-core.ts'
import { createSeededPglite } from './pglite.ts'

const A = '0x00000000000000000000000000000000000000a1'
const B = '0x00000000000000000000000000000000000000b1'
const ISA = '0x00000000000000000000000000000000000000d1'
const hash = (n: number) => `0x${n.toString(16).padStart(64, '0')}`
const USDC = 10n ** 6n

const event = (name: 'DividendDistributed' | 'Claimed', who: string, amount: bigint, address = ISA) => ({
	address: getAddress(address),
	topics: encodeEventTopics({
		abi: liquidISAAbi, eventName: name, args: (name === 'Claimed' ? { holder: who } : { from: who }) as never,
	}) as Hex[],
	data: encodeAbiParameters([{ type: 'uint256' }], [amount]),
}) as unknown as Log

describe('dividend receipts', () => {
	const ok = { status: 'success', to: ISA, from: A, logs: [] as Log[] }

	it('rejects a wrong target, wrong sender and failed status', () => {
		assert.throws(() => checkReceipt(ok, { to: B, from: A }), /different contract/)
		assert.throws(() => checkReceipt(ok, { to: ISA, from: B }), /different wallet/)
		assert.throws(
			() => checkReceipt({ ...ok, status: 'reverted' }, { to: ISA, from: A }),
			/failed onchain/,
		)
	})

	it('decodes DividendDistributed only from the ISA and the payer', () => {
		const logs = [event('DividendDistributed', A, 250n * USDC)]
		assert.strictEqual(decodeDividendReceipt(logs, { isa: ISA, payer: A }).amount, 250n * USDC)
		assert.throws(() => decodeDividendReceipt(logs, { isa: ISA, payer: B }), /different wallet/)
		assert.throws(() => decodeDividendReceipt(logs, { isa: B, payer: A }), /no dividend/)
	})

	it('decodes Claimed only from the ISA and the holder', () => {
		const logs = [event('Claimed', A, 7n * USDC)]
		assert.strictEqual(decodeClaimReceipt(logs, { isa: ISA, holder: A }).amount, 7n * USDC)
		assert.throws(() => decodeClaimReceipt(logs, { isa: ISA, holder: B }), /different wallet/)
		assert.throws(() => decodeClaimReceipt([], { isa: ISA, holder: A }), /no claim/)
	})
})

describe('claim recording', () => {
	let db: PGlite
	let creator: string
	before(async() => {
		db = await createSeededPglite()
		await db.exec('SET search_path TO smx, public')
		const { rows: [u] } = await db.query<{ id: string }>(
			'INSERT INTO users(email, name) VALUES (\'c@test.co\', \'c\') RETURNING id',
		)
		const { rows: [c] } = await db.query<{ id: string }>(
			`SELECT id FROM launch_ipo($1, $2, 'CLMS', 'CLMS', '', 500, 60, 1000, 1000, '778',
				'local:x', 'x', 296)`,
			[u.id, A],
		)
		creator = c.id
	})
	after(async() => {
		await db.close()
	})

	it('is idempotent by tx hash and refuses another wallet', async() => {
		const q = (wallet: string) => db.query<{ id: string, amount: string }>(
			'SELECT id, amount::TEXT FROM ingest_dividend_claim($1, $2, $3, $4)',
			[creator, wallet, hash(9), String(12n * USDC)],
		)
		const first = await q(A)
		const again = await q(A)
		assert.strictEqual(again.rows[0].id, first.rows[0].id)
		assert.strictEqual(Number(first.rows[0].amount), 12)
		await assert.rejects(q(B), /another claim/)
		const { rows: [n] } = await db.query<{ n: string }>('SELECT count(*) AS n FROM dividend_claims')
		assert.strictEqual(Number(n.n), 1)
	})

	it('adds claims to the portfolio dividends received', async() => {
		const { rows: [r] } = await db.query<{ j: { dividends: { total: string, count: number, items: Array<{ txHash: string }> } } }>(
			'SELECT wallet_portfolio_with_claims_json($1, NULL) AS j', [A],
		)
		assert.strictEqual(Number(r.j.dividends.total), 12)
		assert.strictEqual(r.j.dividends.count, 1)
		assert.strictEqual(r.j.dividends.items[0].txHash, hash(9))
	})
})

describe('mainnet HBAR rail', () => {
	it('fails closed without a rate or token, keeps the testnet default', () => {
		assert.throws(
			() => assertHbarRailConfigured({ network: 'mainnet', hbarPerUsdc: '', tokenId: '' }),
			/off on mainnet/,
		)
		assert.doesNotThrow(() => assertHbarRailConfigured({ network: 'mainnet', hbarPerUsdc: '0.01', tokenId: '' }))
		assert.doesNotThrow(() => assertHbarRailConfigured({ network: 'mainnet', hbarPerUsdc: '', tokenId: '0.0.5555' }))
		assert.doesNotThrow(() => assertHbarRailConfigured({ network: 'testnet', hbarPerUsdc: '0.0001', tokenId: '' }))
		assert.throws(() => createHederaPaymentRequest({
			dividendId: 'd', amount: '1', splits: [{ wallet: A, amount: '1' }],
			live: true, network: 'mainnet', hbarPerUsdc: '', tokenId: '',
		}), /off on mainnet/)
	})
})
