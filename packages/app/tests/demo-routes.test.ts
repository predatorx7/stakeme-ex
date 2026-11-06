import assert from 'node:assert'
import { after, before, describe, it } from 'node:test'
import { runIncomeAudit } from '../src/utils/income-audit.ts'
import { bootApp, type BootedApp } from './utils.ts'

type Err = { output?: { statusCode: number } }
const hasStatus = (code: number) => (err: Err) => (
	err.output?.statusCode === code
)

const KEY = 'test-admin-key-0123456789'
const WALLET = '0x00000000000000000000000000000000000000a1'

describe('demo-only routes', () => {
	let app: BootedApp
	let creatorId: string
	let ownerId: string
	let otherId: string
	let seq = 0
	before(async() => {
		process.env.SMX_ADMIN_KEY = KEY
		app = await bootApp()
		const user = async(n: string) => {
			const { rows: [u] } = await app.pglite.query<{ id: string }>(
				'INSERT INTO users(email, name) VALUES ($1, $2) RETURNING id',
				[`${n}@test.co`, n],
			)
			return u.id
		}

		ownerId = await user('owner')
		otherId = await user('other')
		const { rows: [c] } = await app.pglite.query<{ id: string }>(
			`SELECT id FROM launch_ipo($1, $2, 'DEMX', 'DEMX', '', 500, 60, 10000,
				1000, $3, 'local:x', 'x', 296)`,
			[ownerId, WALLET, '9001'],
		)
		creatorId = c.id
		await app.pglite.query(
			'SELECT record_investment($1, $2, 100)', [creatorId, WALLET],
		)
		await app.pglite.query('SELECT close_raise($1)', [creatorId])
	})
	after(async() => {
		delete process.env.SMX_ADMIN_KEY
		await app.close()
	})

	const fixture = () => ({
		demo: true,
		amount: '5000.00',
		context: creatorId,
		id: `0xdemo${++seq}`,
	})
	const post = (path: string, body: unknown, headers = {}) => app.fetch(path, {
		method: 'POST',
		headers: { 'content-type': 'application/json', ...headers },
		body: JSON.stringify(body),
	})

	it('rejects an anonymous demo proof', async() => {
		const res = await post('/api/audit-milestone', { proof: fixture() })
		assert.ok([401, 403].includes(res.status), `got ${res.status}`)
	})

	it('rejects demo proofs on /reclaim/callback', async() => {
		const before = await app.pglite.query('SELECT 1 FROM income_proofs')
		const res = await post('/reclaim/callback', fixture())
		assert.notStrictEqual(res.status, 201)
		assert.notStrictEqual(res.status, 202)
		const after = await app.pglite.query('SELECT 1 FROM income_proofs')
		assert.strictEqual(after.rows.length, before.rows.length)
	})

	it('rejects a non-owner and accepts the owner, then rate limits', async() => {
		await assert.rejects(
			runIncomeAudit(app.pg, fixture(), { demoViewerId: otherId }),
			hasStatus(403),
		)
		await assert.rejects(
			runIncomeAudit(app.pg, fixture()),
			hasStatus(401),
		)
		for(let i = 0; i < 3; i++) {
			const out = await runIncomeAudit(
				app.pg, fixture(), { demoViewerId: ownerId },
			)
			assert.ok(['audited', 'unavailable'].includes(out.kind))
		}

		await assert.rejects(
			runIncomeAudit(app.pg, fixture(), { demoViewerId: ownerId }),
			hasStatus(429),
		)
	})

	it('trigger-default needs the admin key', async() => {
		const body = { ticker: 'DEMX' }
		const none = await post('/api/trigger-default', body)
		assert.strictEqual(none.status, 403)
		const wrong = await post(
			'/api/trigger-default', body, { 'x-admin-key': 'nope' },
		)
		assert.strictEqual(wrong.status, 403)
		const ok = await post('/api/trigger-default', body, { 'x-admin-key': KEY })
		assert.notStrictEqual(ok.status, 403)
	})
})
