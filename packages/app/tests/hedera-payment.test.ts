import assert from 'node:assert'
import { describe, it } from 'node:test'
import { syntheticIsin } from '../src/integrations/hedera-ats.ts'
import {
	allocateSplits,
	assertTransfersMatch,
	buildPaymentRequest,
} from '../src/services/payment/hedera-payment-requirements.ts'

const A = `0x${'a'.repeat(40)}`
const B = `0x${'b'.repeat(40)}`
const C = `0x${'c'.repeat(40)}`

describe('x402 payment requirements', () => {
	it('splits sum to the dividend; dust goes to the largest', () => {
		// 100 USDC over 3 holders; the SQL floor left 1 micro unit unassigned.
		const splits = [
			{ wallet: A, amount: '33.333333' },
			{ wallet: B, amount: '33.333333' },
			{ wallet: C, amount: '33.333333' },
		]
		const micro = allocateSplits('100', splits)
		assert.equal(micro.reduce((a, b) => a + b, 0n), 100_000_000n)
		assert.deepEqual(micro, [33_333_334n, 33_333_333n, 33_333_333n])

		const request = buildPaymentRequest({
			dividendId: 'd1',
			amount: '100',
			splits,
			network: 'hedera:testnet',
			asset: '0.0.5555',
			feePayer: '0.0.1001',
		})
		assert.equal(request.accepts.length, 3)
		assert.equal(request.total, '100000000')
		assert.equal(request.accepts[0].payTo, `0.0.${'a'.repeat(40)}`)
		assert.equal(request.accepts[0].extra.feePayer, '0.0.1001')
	})

	it('rejects splits that do not add up and scales HBAR to tinybars', () => {
		assert.throws(() => allocateSplits('100', [{ wallet: A, amount: '90' }]))
		const request = buildPaymentRequest({
			dividendId: 'd2',
			amount: '1',
			splits: [{ wallet: A, amount: '1' }],
			network: 'hedera:testnet',
			asset: '0.0.0',
			feePayer: '0.0.1001',
		})
		// 1 USDC = 0.01 HBAR = 1,000,000 tinybars.
		assert.equal(request.total, '1000000')
	})

	it('only accepts a transaction that pays exactly the request', () => {
		const request = buildPaymentRequest({
			dividendId: 'd3',
			amount: '10',
			splits: [
				{ wallet: A, amount: '6' },
				{ wallet: B, amount: '4' },
			],
			network: 'hedera:testnet',
			asset: '0.0.0',
			feePayer: '0.0.1001',
		})
		const good = [
			{ account: '0.0.77', amount: -10_000_000n },
			{ account: `0.0.${'a'.repeat(40)}`, amount: 6_000_000n },
			{ account: `0.0.${'b'.repeat(40)}`, amount: 4_000_000n },
		]
		assert.equal(assertTransfersMatch(request, good), '0.0.77')
		assert.throws(() => assertTransfersMatch(request, [
			good[0],
			good[1],
			{ account: `0.0.${'b'.repeat(40)}`, amount: 3_000_000n },
		]))
		assert.throws(() => assertTransfersMatch(request, [
			...good,
			{ account: '0.0.99', amount: 1n },
		]))
	})

	it('builds a 12 character ATS ISIN', () => {
		assert.match(syntheticIsin('MUSH'), /^XS[0-9A-F]{9}\d$/)
	})
})
