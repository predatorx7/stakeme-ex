import assert from 'node:assert'
import { describe, it } from 'node:test'
import {
	atsMode,
	buildDeployEquityArgs,
	isAtsConfigured,
	simulateEquityToken,
} from '../src/integrations/hedera-ats.ts'

const holder = '0x96B380895ea976cbEc267b959A1D116C457705aF'
const input = {
	ticker: 'MUSH',
	name: 'Mushroom Creator Equity',
	supply: '1000',
	decimals: 18,
	holder,
} as const

describe('hedera ats', () => {
	it('defaults to simulated mode', () => {
		assert.strictEqual(atsMode(), 'simulated')
		assert.strictEqual(isAtsConfigured(), false)
		assert.strictEqual(simulateEquityToken(input).status, 'SIMULATED')
	})

	it('builds public-deployment deployEquity args', () => {
		const [equity, regulation] = buildDeployEquityArgs(input, holder)
		assert.strictEqual(equity.security.maxSupply, 1000n * 10n ** 18n)
		// Version 0 is rejected by the public BLR; default is 1.
		assert.strictEqual(equity.security.resolverProxyConfiguration.version, 1n)
		assert.strictEqual(equity.security.erc20MetadataInfo.isin.length, 12)
		// The factory forbids regulation 0/0.
		assert.deepStrictEqual(
			[regulation.regulationType, regulation.regulationSubType],
			[2, 1],
		)
	})
})
