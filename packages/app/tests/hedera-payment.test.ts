import assert from 'node:assert'
import { describe, it } from 'node:test'
import { syntheticIsin } from '../src/integrations/hedera-ats.ts'
import {
	createHederaPaymentRequest,
	settleHederaPayment,
} from '../src/services/payment/hedera-payment-core.ts'
import {
	allocateSplits,
	assertTransfersMatch,
	buildPaymentRequest,
	convertToTinybars,
	formatHbar,
	parseHbarRate,
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
			hbarPerUsdc: '0.01',
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
			hbarPerUsdc: '0.01',
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

	it('converts USDC to HBAR at the configured testnet rate', () => {
		// 0.0001 HBAR per USDC: $250 sends 0.025 HBAR.
		assert.equal(parseHbarRate('0.0001'), 10_000n)
		const request = buildPaymentRequest({
			dividendId: 'd4',
			amount: '250',
			splits: [{ wallet: A, amount: '150' }, { wallet: B, amount: '100' }],
			network: 'hedera:testnet',
			asset: '0.0.0',
			hbarPerUsdc: '0.0001',
			feePayer: '0.0.1001',
		})
		assert.equal(request.totalUsd, '250')
		assert.equal(request.totalHbar, '0.025')
		assert.equal(request.total, '2500000')
		assert.deepEqual(request.accepts.map((r) => r.amount), [
			'1500000', '1000000',
		])
		assert.equal(formatHbar(2_500_000n), '0.025')
		assert.equal(formatHbar(100_000_000n), '1')
		assert.throws(() => parseHbarRate('0'))
		assert.throws(() => parseHbarRate('abc'))
	})

	it('HBAR parts sum exactly to the rounded total', () => {
		const micro = [33_333_334n, 33_333_333n, 33_333_333n, 1n, 7n]
		for(const rate of ['0.0001', '0.01', '0.00000003', '1.23456789']) {
			const parts = convertToTinybars(micro, rate)
			const sum = micro.reduce((a, b) => a + b, 0n)
			const expected = (sum * parseHbarRate(rate) + 500_000n) / 1_000_000n
			assert.equal(parts.reduce((a, b) => a + b, 0n), expected)
			assert.ok(parts.every((p) => p >= 0n))
		}
	})

	it('builds a 12 character ATS ISIN', () => {
		assert.match(syntheticIsin('MUSH'), /^XS[0-9A-F]{9}\d$/)
	})
})

describe('settleHederaPayment simulated payloads', () => {
	const request = {
		...buildPaymentRequest({
			dividendId: 'd9',
			amount: '1',
			splits: [{ wallet: A, amount: '1' }],
			network: 'hedera:testnet',
			asset: '0.0.0',
			hbarPerUsdc: '0.01',
			feePayer: '0.0.1001',
		}),
		mode: 'live' as const,
	}
	const paymentPayload = { x402Version: 2, simulated: true }

	it('rejects a simulated payload when the rail is live', async() => {
		await assert.rejects(
			settleHederaPayment({ request, paymentPayload, live: true }),
			(err: Error) => /Live Hedera payment required/.test(err.message),
		)
		await assert.rejects(
			settleHederaPayment({ request, paymentPayload: {}, live: true }),
			(err: Error) => /Live Hedera payment required/.test(err.message),
		)
	})

	it('accepts a simulated payload when the rail is simulated', async() => {
		const result = await settleHederaPayment({
			request,
			paymentPayload,
			live: false,
		})
		assert.equal(result.status, 'SIMULATED')
	})
})

describe('no silent simulated fallback', () => {
	const input = {
		dividendId: 'd10',
		amount: '1',
		splits: [{ wallet: A, amount: '1' }],
		hbarPerUsdc: '0.0001',
	}

	it('refuses simulated mode when it is not allowed (production)', async() => {
		assert.throws(
			() => createHederaPaymentRequest({
				...input, live: false, allowSimulated: false,
			}),
			(err: Error) => /simulated payments are off/.test(err.message),
		)
		const request = {
			...buildPaymentRequest({
				...input,
				network: 'hedera:testnet',
				asset: '0.0.0',
				feePayer: '0.0.1001',
			}),
			mode: 'simulated' as const,
		}
		await assert.rejects(
			settleHederaPayment({
				request, paymentPayload: undefined, live: false,
				allowSimulated: false,
			}),
			(err: Error) => /simulated payments are off/.test(err.message),
		)
	})

	it('with keys present the request is live, never simulated', () => {
		const request = createHederaPaymentRequest({
			...input, live: true, allowSimulated: false,
		})
		assert.equal(request.mode, 'live')
		assert.equal(request.totalHbar, '0.0001')
	})
})
