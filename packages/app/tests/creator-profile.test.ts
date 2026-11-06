/* eslint-disable @stylistic/max-len, unicorn/no-await-expression-member */
import type { PGlite } from '@electric-sql/pglite'
import assert from 'node:assert'
import { after, before, describe, it } from 'node:test'
import { PROOF_CADENCE_DAYS, TRANCHE_PRESETS } from '../src/consts.ts'
import { createSeededPglite } from './pglite.ts'

const WALLET = '0x00000000000000000000000000000000000000a1'

let db: PGlite
let seq = 0

before(async() => {
	db = await createSeededPglite()
	await db.exec('SET search_path TO smx, public')
})
after(async() => {
	await db.close()
})

async function newUser() {
	const n = ++seq
	const { rows: [u] } = await db.query<{ id: string }>(
		'INSERT INTO users(email, name) VALUES ($1, $2) RETURNING id',
		[`profile${n}@test.co`, `user ${n}`],
	)
	return { id: u.id, nullifier: String(5000 + n) }
}

/** Launches with a custom tranche schedule, cadence and links. */
async function launch(
	ticker: string,
	opts: { bps?: number[], cadence?: string, links?: object, raise?: number, open?: boolean } = {},
) {
	const u = await newUser()
	const { rows: [c] } = await db.query<{ id: string }>(
		`SELECT id FROM launch_ipo($1, $2, $3, $3, '', 500, 60, $4, 1000, $5,
			'local:x', 'x', 296, NULL, $6::INTEGER[], $7::proof_cadence, $8::JSONB)`,
		[
			u.id, WALLET, ticker, opts.raise ?? 10000, u.nullifier,
			opts.bps ?? [2000, 4000, 4000], opts.cadence ?? 'MONTHLY',
			JSON.stringify(opts.links ?? {}),
		],
	)
	// Closing the raise releases tranche 0 and starts the proof clock.
	if(!opts.open) {
		await db.query('SELECT record_investment($1, $2, 100)', [c.id, WALLET])
		await db.query('SELECT close_raise($1)', [c.id])
	}

	return { id: c.id, userId: u.id }
}

async function approveProof(creator: string, ref: string, amount = 5000) {
	const { rows: [p] } = await db.query<{ id: string }>(
		'SELECT id FROM submit_income_proof($1, \'bank\', $2, $3, \'{}\')',
		[creator, ref, amount],
	)
	await db.query('SELECT * FROM audit_income_proof($1, $2, \'{"approved":true}\')', [p.id, amount])
}

const dueInDays = async(id: string) => Number((await db.query<{ d: string }>(
	`SELECT round(extract(epoch FROM (next_proof_due_at - ipo_at)) / 86400)::TEXT AS d
	FROM creators WHERE id = $1`, [id],
)).rows[0].d)

describe('tranche presets', () => {
	for(const [i, [name, bps]] of Object.entries(TRANCHE_PRESETS).entries()) {
		it(`${name} creates ${bps.length} tranches and passes trancheBps to createISA`, async() => {
			const { id } = await launch(`PRS${'ABCDE'[i]}`, { bps: [...bps], open: true })
			const { rows } = await db.query<{ idx: number, amount: string, status: string }>(
				'SELECT idx, amount, status FROM tranches WHERE creator_id = $1 ORDER BY idx', [id],
			)
			assert.strictEqual(rows.length, bps.length)
			assert.deepStrictEqual(
				rows.map((r) => Number(r.amount)),
				bps.map((b) => b),
			)
			assert.deepStrictEqual(rows.map((r) => r.status), rows.map(() => 'LOCKED'))

			const { rows: [job] } = await db.query<{ args: { trancheBps: number[] } }>(
				'SELECT args FROM chain_jobs WHERE creator_id = $1 AND fn = \'createISA\'', [id],
			)
			assert.deepStrictEqual(job.args.trancheBps, bps)
		})
	}

	it('rejects an empty schedule, more than 5 and non-10000 schedules', async() => {
		let n = 0
		for(const bps of [[], [0], [1000, 1000, 1000, 1000, 1000, 5000], [5000, 4000], [10000, 0]]) {
			await assert.rejects(
				launch(`BAD${String.fromCharCode(65 + n++)}`, { bps }),
				/Tranche schedule/,
			)
		}
	})
})

describe('proof cadence', () => {
	it('sets the first deadline from the cadence', async() => {
		const monthly = await launch('CADA')
		const quarterly = await launch('CADB', { cadence: 'QUARTERLY' })
		assert.strictEqual(await dueInDays(monthly.id), PROOF_CADENCE_DAYS.MONTHLY)
		assert.strictEqual(await dueInDays(quarterly.id), PROOF_CADENCE_DAYS.QUARTERLY)
	})

	it('a quarterly creator is not late at 31 days, enters grace at 91, with 14 days of grace', async() => {
		const { id } = await launch('CADC', { cadence: 'QUARTERLY' })
		const status = async() => (await db.query<{ status: string }>(
			'SELECT status FROM creators WHERE id = $1', [id],
		)).rows[0].status
		await db.query('SELECT * FROM sweep_deadlines(now() + interval \'31 days\')')
		assert.strictEqual(await status(), 'LIVE')
		await db.query('SELECT * FROM sweep_deadlines(now() + interval \'91 days\')')
		assert.strictEqual(await status(), 'GRACE')
		const { rows: [g] } = await db.query<{ d: string }>(
			`SELECT round(extract(epoch FROM (grace_until - now())) / 86400)::TEXT AS d
			FROM creators WHERE id = $1`, [id],
		)
		assert.strictEqual(Number(g.d), 91 + 14)
	})

	it('an approved proof moves the deadline by the creator cadence', async() => {
		const q = await launch('CADD', { cadence: 'QUARTERLY' })
		const m = await launch('CADE')
		await approveProof(q.id, 'q1')
		await approveProof(m.id, 'm1')
		assert.strictEqual(await dueInDays(q.id), 180)
		assert.strictEqual(await dueInDays(m.id), 60)
	})
})

describe('social links', () => {
	it('stores valid links and exposes them in the creator JSON', async() => {
		const links = {
			x: 'https://x.com/mush_dev',
			github: 'https://github.com/mushaheed/smx',
			linkedin: 'https://www.linkedin.com/in/mushaheed',
			website: 'https://mushaheed.dev/about',
		}
		const { id } = await launch('LNKA', { links })
		const { rows: [r] } = await db.query<{ j: { socialLinks: object, proofCadence: string } }>(
			'SELECT creator_json(c) AS j FROM creators c WHERE c.id = $1', [id],
		)
		assert.deepStrictEqual(r.j.socialLinks, links)
		assert.strictEqual(r.j.proofCadence, 'MONTHLY')
	})

	it('leaves out blank links', async() => {
		const { id } = await launch('LNKB', { links: { x: '', website: 'https://mushaheed.dev' } })
		const { rows: [r] } = await db.query<{ j: { socialLinks: object } }>(
			'SELECT creator_json(c) AS j FROM creators c WHERE c.id = $1', [id],
		)
		assert.deepStrictEqual(r.j.socialLinks, { website: 'https://mushaheed.dev' })
	})

	it('rejects bad hosts, schemes and unknown networks', async() => {
		const bad: [object, RegExp][] = [
			[{ x: 'https://x.com.evil.test/mush' }, /X link/],
			[{ x: 'https://evil.test/x.com/mush' }, /X link/],
			[{ x: 'http://x.com/mush' }, /X link/],
			[{ github: 'https://github.com@evil.test/mush' }, /GitHub link/],
			[{ github: 'https://gist.github.com/mush' }, /GitHub link/],
			[{ linkedin: 'https://linkedin.com/feed' }, /LinkedIn link/],
			[{ linkedin: 'https://notlinkedin.com/in/mush' }, /LinkedIn link/],
			[{ website: 'http://mushaheed.dev' }, /website link/],
			[{ website: 'javascript:alert(1)' }, /website link/],
			[{ website: 'https://user@evil.test' }, /website link/],
			[{ website: 'https://mush.dev/"onmouseover=' }, /website link/],
			[{ mastodon: 'https://example.social/@mush' }, /Social links can only/],
		]
		let n = 0
		for(const [links, msg] of bad) {
			await assert.rejects(
				launch(`BDL${String.fromCharCode(65 + n++)}`, { links }),
				msg,
				JSON.stringify(links),
			)
		}
	})
})

describe('creator updates', () => {
	const post = (user: string, ticker: string, body: string, link: string | null = null) => db.query<{ j: { id: string } }>(
		'SELECT creator_update_json(u) AS j FROM post_creator_update($1, $2, $3, $4) u',
		[user, ticker, body, link],
	)

	it('lets only the owner post, and emits CREATOR_UPDATE without a price tick', async() => {
		const { id, userId } = await launch('UPDA')
		const other = await newUser()
		await assert.rejects(post(other.id, 'UPDA', 'hi'), /Only the creator/)

		const ticks = async() => Number((await db.query<{ n: string }>(
			'SELECT count(*) AS n FROM price_ticks WHERE creator_id = $1', [id],
		)).rows[0].n)
		const before = await ticks()
		const { rows: [r] } = await post(userId, 'UPDA', '  Shipped v2.  ', 'https://mushaheed.dev/v2')
		assert.ok(r.j.id)
		const { rows: [e] } = await db.query<{ kind: string, payload: { body: string } }>(
			'SELECT kind, payload FROM oracle_events WHERE creator_id = $1 ORDER BY seq DESC LIMIT 1', [id],
		)
		assert.strictEqual(e.kind, 'CREATOR_UPDATE')
		assert.strictEqual(e.payload.body, 'Shipped v2.')
		assert.strictEqual(await ticks(), before)
		await assert.rejects(post(userId, 'NOPE', 'x'), /not found/)
	})

	it('validates body and link', async() => {
		const { userId } = await launch('UPDB')
		await assert.rejects(post(userId, 'UPDB', '   '), /1 to 1,000/)
		await assert.rejects(post(userId, 'UPDB', 'x'.repeat(1001)), /1 to 1,000/)
		await assert.rejects(post(userId, 'UPDB', 'ok', 'http://example.com'), /https/)
		await assert.rejects(post(userId, 'UPDB', 'ok', 'javascript:alert(1)'), /https/)
		await post(userId, 'UPDB', 'x'.repeat(1000))
	})

	it('allows 5 per rolling day, then 429, and frees a slot after 24 hours', async() => {
		const { id, userId } = await launch('UPDC')
		for(let i = 0; i < 5; i++) {
			await post(userId, 'UPDC', `update ${i}`)
		}

		await assert.rejects(post(userId, 'UPDC', 'one too many'), (err: { code?: string }) => err.code === 'H0429')
		await db.query(
			`UPDATE creator_updates SET created_at = now() - interval '25 hours'
			WHERE id = (SELECT id FROM creator_updates WHERE creator_id = $1 ORDER BY created_at LIMIT 1)`,
			[id],
		)
		await post(userId, 'UPDC', 'back again')
	})

	it('pages newest first with a keyset cursor', async() => {
		const { id, userId } = await launch('UPDD')
		for(let i = 0; i < 4; i++) {
			await post(userId, 'UPDD', `n${i}`)
		}

		// Distinct timestamps: back-to-back inserts can share a clock tick.
		await db.query(
			`UPDATE creator_updates SET created_at = now() - interval '1 hour'
				* (3 - substring(body FROM 2)::INTEGER) WHERE creator_id = $1`,
			[id],
		)
		const page = async(key: string | null, rowId: string | null) => (await db.query<{
			j: { items: { body: string }[], next: { key: string, id: string } | null }
		}>('SELECT creator_updates_page_json($1, $2, $3, 3) AS j', ['UPDD', key, rowId])).rows[0].j
		const first = await page(null, null)
		assert.strictEqual(first.items.length, 3)
		assert.ok(first.next)
		const second = await page(first.next.key, first.next.id)
		assert.strictEqual(second.items.length, 1)
		assert.strictEqual(second.next, null)
		assert.strictEqual(
			[...first.items, ...second.items].map((i) => i.body).join(),
			'n3,n2,n1,n0',
		)
	})
})
