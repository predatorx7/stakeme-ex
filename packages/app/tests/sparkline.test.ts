import assert from 'node:assert'
import { describe, it } from 'node:test'
import {
	sparklineArea,
	sparklinePath
} from '../src/components/charts/sparkline-path.ts'

describe('sparklinePath', () => {
	it('returns empty for no points', () => {
		assert.strictEqual(sparklinePath([], 80, 24), '')
		assert.strictEqual(sparklineArea([], 80, 24), '')
	})

	it('draws a mid-height line for one point', () => {
		assert.strictEqual(sparklinePath([5], 80, 24), 'M0.0 12.0 L80 12.0')
	})

	it('draws a flat series at mid-height', () => {
		assert.strictEqual(
			sparklinePath([3, 3, 3], 80, 24),
			'M0.0 12.0 L40.0 12.0 L80.0 12.0',
		)
	})

	it('maps min to the bottom and max to the top, padded', () => {
		assert.strictEqual(sparklinePath([1, 2], 80, 24), 'M0.0 22.0 L80.0 2.0')
	})

	it('closes the area under the line', () => {
		assert.ok(sparklineArea([1, 2], 80, 24).endsWith('L80 24 L0 24 Z'))
	})
})
