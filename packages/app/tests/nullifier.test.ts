import assert from 'node:assert'
import { describe, it } from 'node:test'
import {
	keccakUtf8,
	nullifierHash,
	onchainNullifierHash
} from '../src/integrations/util.ts'

describe('onchainNullifierHash', () => {
	it('is the plain hash without a salt', () => {
		assert.strictEqual(onchainNullifierHash('123'), nullifierHash('123'))
	})

	it('is keccak256(salt || nullifier) with a salt', () => {
		const h = onchainNullifierHash('123', 'prod')
		assert.strictEqual(h, keccakUtf8('prod123'))
		assert.notStrictEqual(h, nullifierHash('123'))
	})
})
