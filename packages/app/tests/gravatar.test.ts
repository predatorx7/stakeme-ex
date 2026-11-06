import assert from 'node:assert'
import { describe, it } from 'node:test'
import {
	GRAVATAR_STYLES,
	gravatarUrl,
	holderAvatarSeed,
} from '../src/utils/gravatar.ts'

const ADDR = '6f1c2f0e-8f0b-4a53-9a43-0c7a1b2d3e4f'
const WALLET = '0x00000000000000000000000000000000000000A1'

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

	it('seeds a holder by account id, else a hash without the wallet', () => {
		const base = { creatorId: ADDR, wallet: WALLET }
		assert.strictEqual(holderAvatarSeed({ ...base, userId: 'u1' }), 'u1')
		const seed = holderAvatarSeed(base)
		assert.match(seed, /^[\da-f]{64}$/)
		assert.ok(!seed.toLowerCase().includes(WALLET.toLowerCase().slice(2)))
		const lower = { ...base, wallet: WALLET.toLowerCase() }
		assert.strictEqual(seed, holderAvatarSeed(lower))
		const other = { ...base, creatorId: 'other' }
		assert.notStrictEqual(seed, holderAvatarSeed(other))
	})
})
