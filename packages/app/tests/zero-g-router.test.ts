/* eslint-disable @stylistic/max-len, unicorn/no-await-expression-member */
import assert from 'node:assert'
import { after, before, describe, it } from 'node:test'
import type { IncomeAuditInput } from '../src/integrations/types.ts'
import {
	getRouterBalance,
	runAuditVerdict,
	ZeroGAuditUnavailable,
} from '../src/integrations/zero-g.ts'
import { ZeroGravityAgent } from '../src/services/oracle/zero-gravity-agent.ts'
import { createSeededPglite } from './pglite.ts'

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
		assert.strictEqual(data.requestId, 'r1')
		assert.strictEqual(data.providerAddress, '0xprov')
		assert.strictEqual(audit.engine, '0g-router')
		assert.strictEqual(audit.requestId, 'r1')
		assert.strictEqual(audit.providerAddress, '0xprov')
		assert.strictEqual(audit.teeVerified, true)
		const body = JSON.parse(calls[0].init.body as string)
		assert.strictEqual(body.verify_tee, true)
		assert.deepStrictEqual(
			(data.routerTrace as { requestId: string }).requestId,
			'r1',
		)
	})

	it('strips a leaked reasoning block before the JSON', async() => {
		const fetchMock = (() => Promise.resolve(jsonRes(200, {
			model: 'glm-5.3',
			choices: [{ message: { content: '{think} {x}</think>'
				+ JSON.stringify({
					approved: true,
					verified_amount: '5000.00',
					reasoning: 'ok',
				}) } }],
			x_0g_trace: { request_id: 'r2', provider: '0xprov' },
		}))) as unknown as typeof fetch
		const res = await runAuditVerdict(INPUT, {
			fetch: fetchMock,
			router: ROUTER,
		})
		assert.strictEqual(res.verdict.approved, true)
		assert.strictEqual(res.teeVerified, null)
	})

	it('tries the next model only on an unbilled overload', async() => {
		const models: string[] = []
		const fetchMock = ((_url: string, init: RequestInit) => {
			const { model } = JSON.parse(init.body as string)
			models.push(model)
			return Promise.resolve(model === 'busy'
				? jsonRes(429, { error: { code: 'model_overloaded' } })
				: jsonRes(200, {
					model,
					choices: [{ message: { content: JSON.stringify({
						approved: true,
						verified_amount: '5000.00',
						reasoning: 'ok',
					}) } }],
					x_0g_trace: { request_id: 'r3', provider: '0xp' },
				}))
		}) as unknown as typeof fetch
		const res = await runAuditVerdict(INPUT, {
			fetch: fetchMock,
			router: { ...ROUTER, model: 'busy, backup' },
		})
		assert.deepStrictEqual(models, ['busy', 'backup'])
		assert.strictEqual(res.model, 'backup')
	})

	it('throws instead of approving on 402', async() => {
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
		await assert.rejects(
			runAuditVerdict(INPUT, {
				fetch: fetchMock,
				router: ROUTER,
				allowRulesFallback: false,
			}),
			ZeroGAuditUnavailable,
		)
		assert.strictEqual(n, 1, 'no retry')
	})

	it('agent.audit rejects with ZeroGAuditUnavailable', async() => {
		const fetchMock = (() => Promise.resolve(jsonRes(503, {}))) as unknown as
			typeof fetch
		await assert.rejects(
			new ZeroGravityAgent({
				fetch: fetchMock,
				router: ROUTER,
				allowRulesFallback: false,
			}).audit(INPUT),
			ZeroGAuditUnavailable,
		)
	})

	it('uses the rules engine only with the explicit fallback', async() => {
		const fetchMock = (() => Promise.resolve(jsonRes(402, {}))) as unknown as
			typeof fetch
		const res = await runAuditVerdict(INPUT, {
			fetch: fetchMock,
			router: ROUTER,
			allowRulesFallback: true,
		})
		assert.strictEqual(res.model, 'rules-engine')
		assert.strictEqual(res.provider, null)
		assert.strictEqual(res.verdict.approved, true)
	})

	it('has no Router key: unavailable unless fallback allowed', async() => {
		const fetchMock = (() => {
			throw new Error('must not be called')
		}) as unknown as typeof fetch
		await assert.rejects(
			runAuditVerdict(INPUT, {
				fetch: fetchMock,
				router: { apiKey: '' },
				allowRulesFallback: false,
			}),
			ZeroGAuditUnavailable,
		)
		const res = await runAuditVerdict(INPUT, {
			fetch: fetchMock,
			router: { apiKey: '' },
			allowRulesFallback: true,
		})
		assert.strictEqual(res.model, 'rules-engine')
	})

	it('reads no balance without a management key', async() => {
		assert.strictEqual(await getRouterBalance(), null)
	})
})

describe('0G audit unavailable', () => {
	let db: Awaited<ReturnType<typeof createSeededPglite>>
	before(async() => {
		db = await createSeededPglite()
		await db.exec('SET search_path TO smx, public')
	})
	after(async() => {
		await db.close()
	})

	it('keeps the proof PENDING, flags it, and a retry reuses the row', async() => {
		const { rows: [u] } = await db.query<{ id: string }>(
			'INSERT INTO users(email, name) VALUES (\'z@test.co\', \'z\') RETURNING id',
		)
		const { rows: [c] } = await db.query<{ id: string }>(
			`SELECT id FROM launch_ipo($1, '0x00000000000000000000000000000000000000a1',
				'ZGT', 'ZGT', '', 500, 60, 10000, 1000, '9001', 'local:x', 'x', 296)`,
			[u.id],
		)
		const submit = () => db.query<{ id: string, status: string }>(
			'SELECT id, status FROM submit_income_proof($1, \'bank\', \'p-1\', 5000, \'{}\')',
			[c.id],
		)
		const first = (await submit()).rows[0]
		const { rows: [held] } = await db.query<{ j: Record<string, unknown> }>(
			'SELECT audit_result_json(p) AS j FROM mark_audit_unavailable($1, $2) p',
			[first.id, '0G Router HTTP 402 insufficient_balance'],
		)
		const proof = held.j.proof as Record<string, unknown>
		assert.strictEqual(held.j.approved, false)
		assert.strictEqual(proof.status, 'PENDING')
		assert.strictEqual(proof.auditStatus, 'AUDIT_UNAVAILABLE')
		const again = (await submit()).rows[0]
		assert.strictEqual(again.id, first.id)
		const { rows: divs } = await db.query('SELECT 1 FROM dividends')
		assert.strictEqual(divs.length, 0, 'no dividend without a 0G audit')
	})
})
