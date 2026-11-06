import assert from 'node:assert'
import { describe, it } from 'node:test'
import { TRANCHE_PRESETS } from '../src/consts.ts'
import {
	projectIncome,
	suggestTerms,
	type TermsInput,
} from '../src/utils/terms-suggest.ts'

const base: TermsInput = {
	monthlyIncome: 5000,
	goalAmount: 20000,
	termMonths: 24,
}
const codes = (i: TermsInput) => suggestTerms(i)!.warnings.map(w => w.code)

describe('terms suggestion', () => {
	it('projects income with and without growth', () => {
		assert.strictEqual(projectIncome(1000, 12), 12000)
		// k=12 term is exactly 1000 * 1.1.
		assert.ok(projectIncome(1000, 12, 10) > 12000)
		const one = projectIncome(1000, 1, 10)
		assert.ok(Math.abs(one - 1000 * 1.1 ** (1 / 12)) < 1e-9)
	})

	it('computes share, dividend and projected income', () => {
		const s = suggestTerms(base)!
		// 20000 * 1.3 / 120000 = 21.67% -> 2167 bps.
		assert.strictEqual(s.shareBps, 2167)
		assert.strictEqual(s.sharePct, '21.67')
		assert.strictEqual(s.projectedTermIncome, '120000.00')
		assert.strictEqual(s.monthlyDividend, '1083.50')
		assert.ok(s.reasons.shareBps.length > 0)
	})

	it('clamps share to 1..5000 bps', () => {
		assert.strictEqual(
			suggestTerms({ ...base, goalAmount: 0.01 })!.shareBps,
			1,
		)
		assert.strictEqual(
			suggestTerms({ ...base, goalAmount: 1e6 })!.shareBps,
			5000,
		)
	})

	it('warns share-high above 20%', () => {
		assert.deepStrictEqual(codes(base), ['share-high'])
		assert.deepStrictEqual(codes({ ...base, goalAmount: 10000 }), [])
	})

	it('warns goal-unreachable above 50% unclamped', () => {
		const c = codes({ ...base, goalAmount: 100000 })
		assert.ok(c.includes('goal-unreachable'))
		assert.ok(c.includes('share-high'))
	})

	it('warns below-min-income', () => {
		const has = (monthlyIncome: number) => {
			const c = codes({ ...base, monthlyIncome })
			return c.includes('below-min-income')
		}

		assert.ok(has(999))
		assert.ok(!has(1000))
	})

	it('caps stake at half of savings and floors it at 1', () => {
		assert.strictEqual(suggestTerms(base)!.stake, '2000.00')
		const stake = (extra: Partial<TermsInput>) => {
			return suggestTerms({ ...base, ...extra })!.stake
		}

		assert.strictEqual(stake({ savings: 1000 }), '500.00')
		assert.strictEqual(stake({ savings: 1e6 }), '2000.00')
		assert.strictEqual(stake({ savings: 0 }), '1.00')
		assert.strictEqual(stake({ goalAmount: 5 }), '1.00')
	})

	it('buckets the tranche schedule by goal over monthly income', () => {
		const at = (months: number) => {
			const goalAmount = 5000 * months
			return suggestTerms({ ...base, goalAmount })!.trancheSchedule
		}

		assert.strictEqual(at(6), 'single')
		assert.strictEqual(at(7), '20-40-40')
		assert.strictEqual(at(24), '20-40-40')
		assert.strictEqual(at(25), '20-20-20-20-20')
		for(const m of [6, 7, 25]) {
			assert.ok(at(m) in TRANCHE_PRESETS)
		}
	})

	it('picks cadence from income variability', () => {
		assert.strictEqual(suggestTerms(base)!.proofCadence, 'MONTHLY')
		assert.strictEqual(
			suggestTerms({ ...base, incomeVaries: true })!.proofCadence,
			'QUARTERLY',
		)
	})

	it('returns null for unusable input', () => {
		assert.strictEqual(suggestTerms({ ...base, termMonths: 0 }), null)
		assert.strictEqual(suggestTerms({ ...base, termMonths: 121 }), null)
		assert.strictEqual(suggestTerms({ ...base, monthlyIncome: NaN }), null)
	})
})
