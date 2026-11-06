import assert from 'node:assert'
import { describe, it } from 'node:test'
import { hashTerms } from '../src/integrations/arkiv.ts'
import { simulateChainJob } from '../src/integrations/chain.ts'
import {
	demoIncomeProof,
	extractIncomeAmount,
	verifyIncomeProof,
} from '../src/integrations/reclaim.ts'
import type { IncomeAuditInput, LisaTerms } from '../src/integrations/types.ts'
import { canonicalJson } from '../src/integrations/util.ts'
import {
	demoWorldIdProof,
	verifyWorldIdProof,
} from '../src/integrations/world-id.ts'
import {
	buildAuditPrompt,
	parseAuditResponse,
	rulesAudit,
} from '../src/integrations/zero-g.ts'

// DEMO_MODE=1 comes from .test.env.

const AUDIT_INPUT: IncomeAuditInput = {
	ticker: 'RAVI',
	shareBps: 500,
	minIncome: '1000.00',
	period: 1,
	termsHash: 'abc',
	income: {
		proofId: '0xp1',
		provider: 'demo',
		amount: '5000.00',
		context: 'creator-1',
		raw: {},
	},
}

const TERMS: LisaTerms = {
	ticker: 'RAVI',
	displayName: 'Ravi',
	shareBps: 500,
	termMonths: 60,
	targetRaise: '10000.00',
	stakeAmount: '500',
	trancheBps: [2000, 4000, 4000],
	worldIdNullifier: '123456789',
	creatorWallet: '0x1111111111111111111111111111111111111111',
}

describe('0G audit', () => {
	it('builds a prompt with the deposit and no raw proof', () => {
		const [system, user] = buildAuditPrompt(AUDIT_INPUT)
		assert.strictEqual(system.role, 'system')
		assert.match(user.content, /"amount":"5000.00"/)
		assert.doesNotMatch(user.content, /"raw"/)
	})

	it('parses fenced JSON and normalizes the amount', () => {
		const verdict = parseAuditResponse(
			'```json\n'
				+ '{"approved":true,"verified_amount":"5000","reasoning":"ok"}\n```',
			AUDIT_INPUT,
		)
		assert.deepStrictEqual(verdict, {
			approved: true,
			verifiedAmount: '5000.00',
			reasoning: 'ok',
		})
	})

	it('rejects an answer that accepts more than the deposit', () => {
		assert.throws(() => parseAuditResponse(
			'{"approved":true,"verified_amount":"9000.00","reasoning":"x"}',
			AUDIT_INPUT,
		))
		assert.throws(() => parseAuditResponse('not json', AUDIT_INPUT))
	})

	it('rules engine approves at or above minIncome only', () => {
		assert.strictEqual(rulesAudit(AUDIT_INPUT).approved, true)
		const low = rulesAudit({
			...AUDIT_INPUT,
			income: { ...AUDIT_INPUT.income, amount: '999.99' },
		})
		assert.strictEqual(low.approved, false)
		assert.strictEqual(low.verifiedAmount, '0.00')
	})
})

describe('Arkiv terms', () => {
	it('hash is stable across key order and changes with the terms', () => {
		const a = hashTerms(TERMS)
		const b = hashTerms(JSON.parse(JSON.stringify(
			Object.fromEntries(Object.entries(TERMS).reverse()),
		)))
		assert.strictEqual(a.termsHash, b.termsHash)
		assert.match(a.termsHash, /^[0-9a-f]{64}$/)
		assert.strictEqual(
			canonicalJson({ b: 1, a: { d: 2, c: 3 } }),
			'{"a":{"c":3,"d":2},"b":1}',
		)
		assert.notStrictEqual(
			hashTerms({ ...TERMS, shareBps: 600 }).termsHash,
			a.termsHash,
		)
	})
})

describe('simulated chain', () => {
	it('derives deterministic hashes and addresses from the job id', () => {
		const job = {
			id: 'job-1',
			fn: 'createISA' as const,
			args: {},
			contractAddress: null,
		}
		const first = simulateChainJob(job)
		assert.deepStrictEqual(simulateChainJob(job), first)
		assert.strictEqual(first.status, 'SIMULATED')
		assert.match(first.txHash!, /^0x[0-9a-f]{64}$/)
		assert.match(first.deployed!.isa, /^0x[0-9a-fA-F]{40}$/)
		assert.notStrictEqual(
			simulateChainJob({ ...job, id: 'job-2' }).txHash,
			first.txHash,
		)
		assert.strictEqual(
			simulateChainJob({ ...job, fn: 'invest' }).deployed,
			undefined,
		)
	})
})

describe('demo World ID', () => {
	const wallet = '0x1111111111111111111111111111111111111111'

	it('sybil fixtures collide, success fixtures do not', async() => {
		const sybilA = await verifyWorldIdProof({
			proof: demoWorldIdProof('sybil', 'a'),
			signal: wallet,
		})
		const sybilB = await verifyWorldIdProof({
			proof: demoWorldIdProof('sybil', 'b'),
			signal: '0x2222222222222222222222222222222222222222',
		})
		const ok = await verifyWorldIdProof({
			proof: demoWorldIdProof('success', 'a'),
			signal: wallet,
		})
		assert.strictEqual(sybilA.nullifier, sybilB.nullifier)
		assert.notStrictEqual(ok.nullifier, sybilA.nullifier)
		assert.strictEqual(sybilA.simulated, true)
		assert.match(sybilA.nullifier, /^\d+$/)
	})
})

describe('Reclaim income', () => {
	it('extracts and normalizes the deposit amount', () => {
		assert.strictEqual(extractIncomeAmount({ amount: '$5,000' }), '5000.00')
		assert.strictEqual(extractIncomeAmount({ amount: '12.345' }), '12.345')
		assert.strictEqual(extractIncomeAmount({ amount: 'lots' }), null)
		assert.strictEqual(extractIncomeAmount({}), null)
	})

	it('verifies the demo fixture and echoes context and id', async() => {
		const proof = demoIncomeProof('creator-1', '5000.00')
		const income = await verifyIncomeProof(proof)
		assert.strictEqual(income.amount, '5000.00')
		assert.strictEqual(income.context, 'creator-1')
		assert.strictEqual(income.proofId, proof.id)
	})
})
