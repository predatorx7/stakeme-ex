import assert from 'node:assert'
import { after, before, describe, it } from 'node:test'
import {
	effectiveDemoEpoch,
	onchainNullifierHash
} from '../src/integrations/util.ts'
import { assertDemoPresenter } from '../src/utils/demo-gate.ts'
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

describe('demo helpers', () => {
	let app: BootedApp
	let ownerId: string
	before(async() => {
		process.env.SMX_ADMIN_KEY = KEY
		app = await bootApp()
		const { rows: [u] } = await app.pglite.query<{ id: string }>(
			'INSERT INTO users(email, name) VALUES ($1, $2) RETURNING id',
			['mush@test.co', 'mush'],
		)
		ownerId = u.id
	})
	after(async() => {
		delete process.env.SMX_ADMIN_KEY
		delete process.env.DEMO_PRESENTER_WALLETS
		await app.close()
	})

	const launch = (nullifier: string) => app.pglite.query<{ id: string }>(
		`SELECT id FROM launch_ipo($1, $2, 'MUSH', 'Mush', '', 500, 60, 10000,
			1000, $3, 'local:x', 'x', 296)`,
		[ownerId, WALLET, nullifier],
	)
	const post = (path: string, body?: unknown, headers = {}) => app.fetch(path, {
		method: 'POST',
		headers: { 'content-type': 'application/json', ...headers },
		body: body ? JSON.stringify(body) : undefined,
	})
	const admin = { 'x-admin-key': KEY }

	it('gates on the presenter wallet or admin key', async() => {
		for(const path of ['/demo/reset', '/demo/creators/MUSH/fill-raise']) {
			const none = await post(path, { ticker: 'MUSH' })
			assert.strictEqual(none.status, 403)
			const wrong = await post(path, { ticker: 'MUSH' }, { 'x-admin-key': 'x' })
			assert.strictEqual(wrong.status, 403)
		}

		process.env.DEMO_PRESENTER_WALLETS = ` ${WALLET.toUpperCase()},0xabc`
		const req = (wallet?: string) => ({
			headers: {},
			authMetadata: wallet
				? { id: 'u', email: '', name: '', walletAddress: wallet }
				: undefined,
		}) as unknown as Parameters<typeof assertDemoPresenter>[0]
		assertDemoPresenter(req(WALLET))
		const other = '0x00000000000000000000000000000000000000b2'
		assert.throws(
			() => assertDemoPresenter(req(other)),
			hasStatus(403),
		)
		assert.throws(() => assertDemoPresenter(req()), hasStatus(403))
	})

	it('fill-raise closes the raise and releases tranche 0', async() => {
		await launch('9101')
		const res = await post('/demo/creators/MUSH/fill-raise', undefined, admin)
		assert.strictEqual(res.status, 201)
		const { rows: [c] } = await app.pglite.query<{
			raised_amount: string
			raise_closed_at: string | null
		}>(
			`SELECT raised_amount, raise_closed_at FROM creators
			WHERE ticker = 'MUSH'`,
		)
		assert.strictEqual(Number(c.raised_amount), 10000)
		assert.ok(c.raise_closed_at)
		const { rows: t } = await app.pglite.query<{ status: string }>(
			`SELECT t.status FROM tranches t JOIN creators c ON c.id = t.creator_id
			WHERE c.ticker = 'MUSH' AND t.idx = 0`,
		)
		assert.strictEqual(t[0].status, 'RELEASED')
		const again = await post('/demo/creators/MUSH/fill-raise', undefined, admin)
		assert.strictEqual(again.status, 409)
	})

	it('reset removes every row, bumps the epoch, frees the human', async() => {
		const epoch = async() => {
			const { rows } = await app.pglite.query<{ e: number }>(
				'SELECT demo_epoch() AS e',
			)
			return rows[0].e
		}

		const epoch0 = await epoch()
		const res = await post('/demo/reset', { ticker: 'MUSH' }, admin)
		assert.strictEqual(res.status, 201)
		for(const tbl of [
			'creators', 'investments', 'holdings', 'tranches', 'chain_jobs',
			'oracle_events', 'pools', 'trades',
		]) {
			const { rows } = await app.pglite.query(`SELECT 1 FROM ${tbl}`)
			assert.strictEqual(rows.length, 0, tbl)
		}

		assert.strictEqual(await epoch(), epoch0 + 1)
		// Same nullifier launches again.
		const { rows } = await launch('9101')
		assert.ok(rows[0].id)
	})

	it('epoch scopes the onchain nullifier hash in demo mode only', () => {
		const plain = onchainNullifierHash('9101', 'salt')
		assert.strictEqual(onchainNullifierHash('9101', 'salt', 0), plain)
		const bumped = onchainNullifierHash('9101', 'salt', 1)
		assert.notStrictEqual(bumped, plain)
		assert.notStrictEqual(onchainNullifierHash('9101', 'salt', 2), bumped)
		assert.strictEqual(effectiveDemoEpoch(3, true), 3)
		assert.strictEqual(effectiveDemoEpoch(3, false), 0)
		assert.strictEqual(effectiveDemoEpoch(undefined, true), 0)
	})
})
