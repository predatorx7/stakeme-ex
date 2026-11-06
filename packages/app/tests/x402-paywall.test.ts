import assert from 'node:assert'
import { describe, it } from 'node:test'
import {
	AUDIT_REPORT_PRICE_TINYBARS,
	buildPaymentRequired,
	type IX402Facilitator,
	type PaywallConfig,
	readPaymentHeader,
	runPaywall,
} from '../src/services/payment/x402-paywall.ts'

const config: PaywallConfig = {
	resourceUrl: 'http://localhost/creators/MUSH/audit-report',
	description: 'Audit report for $MUSH',
	network: 'hedera:testnet',
	payTo: '0.0.11340822',
	feePayer: '0.0.9185802',
	amountTinybars: AUDIT_REPORT_PRICE_TINYBARS,
}

function header(accepted: Record<string, unknown>) {
	const payload = { x402Version: 2, accepted, payload: { transaction: 'AA==' } }
	return Buffer.from(JSON.stringify(payload)).toString('base64')
}

const [required] = buildPaymentRequired(config).accepts

function mock(overrides: Partial<IX402Facilitator> = {}) {
	const calls: string[] = []
	const facilitator: IX402Facilitator = {
		async verify() {
			calls.push('verify')
			return { isValid: true }
		},
		async settle() {
			calls.push('settle')
			return {
				success: true,
				transaction: '0.0.9185802@1700000000.000000000',
				network: 'hedera:testnet',
			}
		},
		...overrides,
	}
	return { facilitator, calls }
}

describe('x402 paywall', () => {
	it('builds 0.1 HBAR exact requirements on hedera:testnet', () => {
		assert.equal(required.scheme, 'exact')
		assert.equal(required.network, 'hedera:testnet')
		assert.equal(required.asset, '0.0.0')
		assert.equal(required.amount, '10000000')
		assert.equal(required.payTo, '0.0.11340822')
		assert.equal(required.extra?.feePayer, '0.0.9185802')
	})

	it('answers 402 with requirements and a header when unpaid', async() => {
		const { facilitator, calls } = mock()
		const res = await runPaywall({
			config, facilitator, paymentHeader: undefined,
		})
		assert.equal(res.status, 402)
		assert.ok(res.status === 402 && res.body.accepts.length === 1)
		const decoded = JSON.parse(
			Buffer.from(res.headers['PAYMENT-REQUIRED'], 'base64').toString(),
		)
		assert.deepEqual(decoded.accepts[0], required)
		assert.deepEqual(calls, [])
	})

	it('rejects a payment that does not match the requirements', async() => {
		const { facilitator, calls } = mock()
		const res = await runPaywall({
			config,
			facilitator,
			paymentHeader: header({ ...required, amount: '1' }),
		})
		assert.equal(res.status, 402)
		assert.deepEqual(calls, [])
		const bad = await runPaywall({
			config, facilitator, paymentHeader: 'not-base64-json',
		})
		assert.equal(bad.status, 402)
	})

	it('verifies, settles and returns X-PAYMENT-RESPONSE', async() => {
		const { facilitator, calls } = mock()
		const res = await runPaywall({
			config, facilitator, paymentHeader: header(required),
		})
		assert.equal(res.status, 200)
		assert.deepEqual(calls, ['verify', 'settle'])
		const settled = JSON.parse(
			Buffer.from(res.headers['X-PAYMENT-RESPONSE'], 'base64').toString(),
		)
		assert.equal(settled.transaction, '0.0.9185802@1700000000.000000000')
	})

	it('answers 402 when verify or settle fails', async() => {
		const invalid = mock({
			async verify() {
				return { isValid: false, invalidReason: 'bad_signature' }
			},
		})
		const a = await runPaywall({
			config, facilitator: invalid.facilitator,
			paymentHeader: header(required),
		})
		assert.equal(a.status, 402)
		assert.ok(a.status === 402 && a.body.error?.includes('bad_signature'))
		assert.deepEqual(invalid.calls, [])

		const failed = mock({
			async settle() {
				throw new Error('down')
			},
		})
		const b = await runPaywall({
			config, facilitator: failed.facilitator,
			paymentHeader: header(required),
		})
		assert.equal(b.status, 402)
	})

	it('reads X-PAYMENT or PAYMENT-SIGNATURE', () => {
		assert.equal(readPaymentHeader({ 'x-payment': 'a' }), 'a')
		assert.equal(readPaymentHeader({ 'payment-signature': 'b' }), 'b')
		assert.equal(readPaymentHeader({}), undefined)
	})
})
