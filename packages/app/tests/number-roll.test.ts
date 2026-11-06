import assert from 'node:assert'
import { describe, it } from 'node:test'
import { diffChars, rollSpan } from '../src/client/number-roll.ts'

const rolled = (a: string, b: string) => diffChars(a, b)
	.map(p => p.roll ? p.char : '.').join('')

describe('number roll diff', () => {
	it('rolls only changed digits', () => {
		assert.strictEqual(rolled('$12.34', '$12.39'), '.....9')
		assert.strictEqual(rolled('$12.34', '$12.34'), '......')
	})

	it('right-aligns when length changes', () => {
		assert.strictEqual(rolled('$9.99', '$10.00'), '..0.00')
	})

	it('swaps non-digits instantly', () => {
		assert.strictEqual(rolled('1.5%', '1,5%'), '....')
	})

	it('keeps roll direction across carries', () => {
		assert.deepStrictEqual(rollSpan(9, 0, 'up'), { start: 9, end: 10 })
		assert.deepStrictEqual(rollSpan(2, 7, 'up'), { start: 2, end: 7 })
		assert.deepStrictEqual(rollSpan(0, 9, 'down'), { start: 10, end: 9 })
		assert.deepStrictEqual(rollSpan(7, 2, 'down'), { start: 17, end: 12 })
	})
})
