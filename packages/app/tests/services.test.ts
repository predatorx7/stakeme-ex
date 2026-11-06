import assert from 'node:assert'
import { describe, it } from 'node:test'
import {
	createStorageProvider,
	FallbackStorage,
	type IPaymentRail,
	type IStorageProvider,
	LocalStorageProvider,
	type PayableDividend,
	PaymentService,
	SimulatedPaymentRail,
} from '../src/services/index.ts'

const INPUT = {
	kind: 'AUDIT_LOG' as const,
	key: 'audit/RAVI/0/p1',
	data: { b: 1, a: { d: 2, c: 3 } },
	attributes: { ticker: 'RAVI' },
}

describe('storage providers', () => {
	it('local ref is a stable content hash', async() => {
		const local = new LocalStorageProvider()
		const a = await local.putJson(INPUT)
		const swapped = { a: { c: 3, d: 2 }, b: 1 }
		const b = await local.putJson({ ...INPUT, data: swapped })
		assert.strictEqual(a.ref, b.ref)
		assert.strictEqual(a.ref, `local:${a.contentHash}`)
		assert.match(a.contentHash, /^[0-9a-f]{64}$/)
		const other = await local.putJson({ ...INPUT, key: 'audit/RAVI/1/p2' })
		assert.notStrictEqual(other.ref, a.ref)
		const stored = await local.getJson(a.ref) as { data: unknown }
		assert.deepStrictEqual(stored.data, swapped)
	})

	it('falls back to local when the primary fails', async() => {
		const failing: IStorageProvider = {
			name: '0g',
			putJson: async() => {
				throw new Error('indexer down')
			},
		}
		const storage = new FallbackStorage(failing, new LocalStorageProvider())
		const { ref, contentHash } = await storage.putJson(INPUT)
		assert.strictEqual(ref, `local:${contentHash}`)
	})

	it('the factory returns the local provider without 0G keys', async() => {
		// .test.env sets no ZG_PRIVATE_KEY.
		const provider = createStorageProvider()
		assert.strictEqual(provider.name, 'local')
		const { ref } = await provider.putJson(INPUT)
		assert.match(ref, /^local:[0-9a-f]{64}$/)
	})
})

describe('PaymentService', () => {
	const dividend: PayableDividend = {
		id: 'div-1',
		creatorId: 'c-1',
		ticker: 'RAVI',
		amountDue: '250.00',
		splits: [
			{ wallet: `0x${'1'.repeat(40)}`, amount: '150.000000' },
			{ wallet: `0x${'2'.repeat(40)}`, amount: '100.000000' },
		],
	}

	it('pays every split over the rail and records the receipts', async() => {
		const paid: string[] = []
		const rail: IPaymentRail = {
			name: 'fake',
			payout: async(splits) => {
				paid.push(...splits.map((s) => s.amount))
				return { status: 'CONFIRMED', receipts: splits.map((_, i) => `r${i}`) }
			},
		}
		const recorded: Array<[string, string[]]> = []
		const service = new PaymentService(rail, async(id, res) => {
			recorded.push([id, res.receipts])
		})
		await service.payDividend(dividend)
		assert.deepStrictEqual(paid, ['150.000000', '100.000000'])
		assert.deepStrictEqual(recorded, [['div-1', ['r0', 'r1']]])
	})

	it('refuses splits that do not add up to the dividend', async() => {
		const service = new PaymentService(new SimulatedPaymentRail())
		const bad = { ...dividend, amountDue: '251.00' }
		await assert.rejects(service.payDividend(bad))
	})

	it('simulated rail settles a signed payment deterministically', async() => {
		const service = new PaymentService(new SimulatedPaymentRail())
		const a = await service.settle(dividend, { tx: 'x' })
		const b = await service.settle(dividend, { tx: 'y' })
		assert.strictEqual(a.status, 'SIMULATED')
		assert.deepStrictEqual(a.receipts, b.receipts)
		assert.strictEqual(a.receipts.length, 2)
	})
})
