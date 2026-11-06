import assert from 'node:assert'
import { describe, it } from 'node:test'
import {
	BANK_SCENARIOS,
	buildStatement,
	parseScenario,
} from '../src/services/mock-bank.ts'

const NOW = Date.parse('2026-11-07T12:00:00Z')
const proven = (scenario: Parameters<typeof buildStatement>[1]) => {
	const [first] = buildStatement('Ana', scenario, NOW).transactions
	return first
}

describe('mock bank scenarios', () => {
	it('default statement keeps the provider-matched shape', () => {
		assert.deepStrictEqual(buildStatement('Ana', undefined, NOW), {
			account: 'Savings Account XXXX4242',
			holderName: 'Ana',
			balance: '12957.50',
			transactions: [
				{
					id: 'txn_0001',
					date: '2026-11-07',
					description: 'Acme Studio freelance income',
					amount: '5000.00',
					type: 'DEPOSIT',
				},
				{
					id: 'txn_0002',
					date: '2026-11-06',
					description: 'Cloud hosting',
					amount: '42.50',
					type: 'WITHDRAWAL',
				},
			],
		})
	})

	it('proves the expected amount and date from transactions[0]', () => {
		const got = Object.fromEntries(
			BANK_SCENARIOS.map((s) => [s.id, proven(s.id)]),
		)
		assert.deepStrictEqual(
			Object.entries(got).map(([k, t]) => [k, t.amount, t.date, t.type]),
			[
				['salary', '5000.00', '2026-11-07', 'DEPOSIT'],
				['low', '800.00', '2026-11-07', 'DEPOSIT'],
				['big', '25000.00', '2026-11-07', 'DEPOSIT'],
				['several', '5000.00', '2026-11-07', 'DEPOSIT'],
				['none', '0.00', '2026-11-07', 'DEPOSIT'],
				['late', '5000.00', '2026-09-28', 'DEPOSIT'],
			],
		)
	})

	it('several deposits: total row equals the sum of the rows', () => {
		const [total, ...rows] = buildStatement('Ana', 'several', NOW)
			.transactions
		const sum = rows.filter((t) => t.type === 'DEPOSIT')
			.reduce((n, t) => n + Number(t.amount), 0)
		assert.strictEqual(rows.length, 4)
		assert.strictEqual(Number(total.amount), sum)
	})

	it('unknown scenario values fall back to salary', () => {
		assert.strictEqual(parseScenario('nope'), 'salary')
		assert.strictEqual(parseScenario('late'), 'late')
	})
})
