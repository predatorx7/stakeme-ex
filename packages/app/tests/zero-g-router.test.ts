import assert from 'node:assert'
import { describe, it } from 'node:test'
import type { IncomeAuditInput } from '../src/integrations/types.ts'
import { runAuditVerdict } from '../src/integrations/zero-g.ts'
import { ZeroGravityAgent } from '../src/services/oracle/zero-gravity-agent.ts'

const INPUT: IncomeAuditInput = {
	ticker: 'ALICE',
	shareBps: 1000,
	minIncome: '1000.00',
	period: '2026-10',
	termsHash: '0xabc',
	income: { amount: '5000.00', provider: 'bank', proofId: 'p1' },
} as unknown as IncomeAuditInput

const ROUTER = { apiKey: 'sk-test', model: 'glm-5.2', trustMode: 'verified' }

function jsonRes(status: number, body: unknown) {
	return new Response(JSON.stringify(body), { status })
}

describe('0G Router audit', () => {
	it('parses a valid completion and records trace', async() => {
		const calls: { url: string, init: RequestInit }[] = []
		const fetchMock = ((url: string, init: RequestInit) => {
			calls.push({ url, init })
			return Promise.resolve(jsonRes(200, {
				id: 'c1',
				model: 'glm-5.2',
				choices: [{ message: { content: JSON.stringify({
					approved: true,
					verified_amount: '5000.00',
					reasoning: 'ok',
				}) } }],
				x_0g_trace: {
					request_id: 'r1',
					provider: '0xprov',
					tee_verified: true,
				},
			}))
		}) as unknown as typeof fetch
		const agent = new ZeroGravityAgent({ fetch: fetchMock, router: ROUTER })
		const audit = await agent.audit(INPUT)
		assert.strictEqual(audit.approved, true)
		assert.strictEqual(audit.model, 'glm-5.2')
		assert.strictEqual(calls.length, 1)
		assert.ok(calls[0].url.endsWith('/chat/completions'))
		const h = calls[0].init.headers as Record<string, string>
		assert.strictEqual(h['X-0G-Provider-Trust-Mode'], 'verified')
		const doc = audit.logDocument as Record<string, unknown>
		const data = (doc.data ?? doc) as Record<string, unknown>
		assert.strictEqual(data.engine, '0g-router')
		assert.strictEqual(data.provider, '0g-router')
		assert.strictEqual(data.teeVerified, true)
		assert.deepStrictEqual(
			(data.routerTrace as { requestId: string }).requestId,
			'r1',
		)
	})

	it('falls back to the rules engine on 402', async() => {
		let n = 0
		const fetchMock = (() => {
			n++
			return Promise.resolve(jsonRes(402, {
				error: {
					message: 'Insufficient balance to process request.',
					type: 'payment_error',
					code: 'insufficient_balance',
				},
			}))
		}) as unknown as typeof fetch
		const res = await runAuditVerdict(INPUT, {
			fetch: fetchMock,
			router: ROUTER,
		})
		assert.strictEqual(n, 1, 'no retry')
		assert.strictEqual(res.model, 'rules-engine')
		assert.strictEqual(res.provider, null)
		assert.strictEqual(res.verdict.approved, true)
	})

	it('skips the Router without a key', async() => {
		const fetchMock = (() => {
			throw new Error('must not be called')
		}) as unknown as typeof fetch
		const res = await runAuditVerdict(INPUT, {
			fetch: fetchMock,
			router: { apiKey: '' },
		})
		assert.strictEqual(res.model, 'rules-engine')
	})
})
