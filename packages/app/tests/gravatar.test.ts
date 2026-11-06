import assert from 'node:assert'
import { describe, it } from 'node:test'
import { GRAVATAR_STYLES, gravatarUrl } from '../src/utils/gravatar.ts'

const ADDR = '0x00000000000000000000000000000000000000A1'

describe('gravatarUrl', () => {
	it('is stable and case/whitespace-insensitive', () => {
		assert.strictEqual(gravatarUrl(ADDR), gravatarUrl(ADDR))
		assert.strictEqual(
			gravatarUrl(ADDR),
			gravatarUrl(` ${ADDR.toLowerCase()} `),
		)
	})

	it('uses a generated style, forces it and doubles the size', () => {
		const url = new URL(gravatarUrl(ADDR, 40))
		assert.match(url.pathname, /^\/avatar\/[\da-f]{64}$/)
		assert.ok(GRAVATAR_STYLES.includes(url.searchParams.get('d') as never))
		assert.strictEqual(url.searchParams.get('f'), 'y')
		assert.strictEqual(url.searchParams.get('s'), '80')
	})

	it('varies the style across seeds', () => {
		const styles = new Set<string | null>()
		for(let i = 0; i < 50; i++) {
			styles.add(new URL(gravatarUrl(`seed-${i}`)).searchParams.get('d'))
		}

		assert.ok(styles.size > 1)
	})
})
