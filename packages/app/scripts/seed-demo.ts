#!/usr/bin/env node
/**
 * Seeds the demo: MUSH (live, investors, trades, a 7-day chart, one approved
 * proof and a paid dividend), RAVI (fresh med-student IPO for the live happy
 * path) and RAHUL (live and overdue, ready for `POST /api/trigger-default`).
 *
 *   npm run seed:demo          PGlite dev database (pg_dev_data)
 *   npm run seed:demo -- --pg  Postgres at DB_URI (`npm run db:up`)
 *
 * Everything goes through the SQL functions, so the data obeys the same rules
 * as the app. Idempotent: creators that exist are skipped. PGlite is a
 * single-process database, so stop `npm run dev` first (or seed, then
 * dev).
 */
import { Pool } from 'pg'
import { PORT } from '../src/consts.ts'
import { LOGGER } from '../src/logger.ts'
import {
	auditIncomeProof,
	getCreatorIdByTicker,
	invest,
	launchIpo,
	payDividend,
	seedSetOverdue,
	seedSpreadHistory,
	seedUpsertUser,
	submitIncomeProof,
	trade,
} from '../src/queries.ts'
import type { IPgClientLike } from '../src/types/index.ts'
import { processChainJobs } from '../src/worker/chain-jobs.ts'
import { applyPgliteMigrations, createPglite } from '../tests/pglite.ts'

const useDocker = process.argv.includes('--pg')

const INVESTORS = [
	'0x1111111111111111111111111111111111111111',
	'0x2222222222222222222222222222222222222222',
	'0x3333333333333333333333333333333333333333',
	'0x4444444444444444444444444444444444444444',
]

const CREATORS = [
	{
		ticker: 'MUSH',
		name: 'Mushaheed',
		headline: 'Software developer building open-source dev tools.',
		wallet: '0xa000000000000000000000000000000000000001',
		nullifier: '710000000000000000000001',
		raise: '20000',
		stake: '2000',
	},
	{
		ticker: 'RAVI',
		name: 'Ravi',
		headline: 'Medical student funding the final two years of school.',
		wallet: '0xa000000000000000000000000000000000000002',
		nullifier: '710000000000000000000002',
		raise: '15000',
		stake: '1500',
	},
	{
		ticker: 'RAHUL',
		name: 'Rahul',
		headline: 'Freelance designer. Has stopped sending proofs.',
		wallet: '0xa000000000000000000000000000000000000003',
		nullifier: '710000000000000000000003',
		raise: '10000',
		stake: '1000',
	},
]

let close = async() => {}

const pg = await connect()
try {
	for(const c of CREATORS) {
		await seedCreator(c)
	}

	// Settle the queued onchain calls now, so the demo opens with no pending
	// badges (simulated mode produces deterministic fake hashes).
	const settled = await processChainJobs(pg)
	LOGGER.info({ settled }, 'chain jobs settled')
	LOGGER.info('demo seeded: MUSH, RAVI, RAHUL')
} finally {
	await close()
}

async function seedCreator(c: (typeof CREATORS)[number]) {
	const [existing] = await getCreatorIdByTicker.run({ ticker: c.ticker }, pg)
	if(existing) {
		LOGGER.info({ ticker: c.ticker }, 'already seeded, skipping')
		return
	}

	const [user] = await seedUpsertUser.run(
		{
			email: `${c.ticker.toLowerCase()}@demo.smx`,
			name: c.name,
			wallet: c.wallet,
		},
		pg,
	)
	await launchIpo.run(
		{
			owner: user.id,
			wallet: c.wallet,
			ticker: c.ticker,
			display_name: c.name,
			headline: c.headline,
			share_bps: 500,
			term_months: 60,
			target_raise: c.raise,
			stake_amount: c.stake,
			nullifier: c.nullifier,
			terms_ref: `local:demo-${c.ticker.toLowerCase()}`,
			terms_hash: `demo-${c.ticker.toLowerCase()}`,
			chain_id: 296,
		},
		pg,
	)

	const amounts = c.ticker === 'RAVI'
		? ['1500', '1000']
		: ['3000', '2500', '2000', '1500']
	for(const [i, usdc] of amounts.entries()) {
		await invest.run(
			{ ticker: c.ticker, wallet: INVESTORS[i], usdc_amount: usdc },
			pg,
		)
	}

	if(c.ticker === 'MUSH') {
		const [row] = await getCreatorIdByTicker.run({ ticker: c.ticker }, pg)
		const [proof] = await submitIncomeProof.run(
			{
				creator_id: row.id,
				provider: 'mock-bank',
				reclaim_proof_id: 'demo-proof-mush-0',
				amount: '5000',
				raw: { demo: true },
			},
			pg,
		)
		const [audited] = await auditIncomeProof.run(
			{
				proof_id: proof.id,
				verified_amount: '5000',
				audit: {
					approved: true,
					model: 'rules-engine',
					reasoning: 'Deposit of 5000 USDC meets the 1000 USDC minimum.',
				},
			},
			pg,
		)
		const dividend = (audited.j as { dividend?: { id: string } }).dividend
		if(dividend) {
			await payDividend.run(
				{ dividend_id: dividend.id, viewer_id: user.id }, pg,
			)
		}

		for(let i = 0; i < 14; i++) {
			const wallet = INVESTORS[i % INVESTORS.length]
			const sell = i % 3 === 2
			await trade.run(
				{
					ticker: c.ticker,
					wallet,
					side: sell ? 'SELL' : 'BUY',
					amount_in: sell ? String(15 + i * 2) : String(25 + i * 9),
					min_out: '0',
				},
				pg,
			)
		}
	}

	if(c.ticker !== 'RAVI') {
		await seedSpreadHistory.run({ ticker: c.ticker, days: 7 }, pg)
	}

	if(c.ticker === 'RAHUL') {
		await seedSetOverdue.run({ ticker: c.ticker, hours: 2 }, pg)
	}

	LOGGER.info({ ticker: c.ticker }, 'seeded creator')
}

async function connect(): Promise<IPgClientLike> {
	if(useDocker) {
		assertDb(process.env.DB_URI)
		const pool = new Pool({
			connectionString: process.env.DB_URI,
			options: '-c search_path=smx,public -c timezone=UTC',
		})
		close = () => pool.end()
		return pool
	}

	// A running dev server holds the PGlite files open.
	const alive = await fetch(`http://localhost:${PORT}/healthz`)
		.then((r) => r.ok, () => false)
	if(alive) {
		throw new Error(
			`The dev server is running on :${PORT} and holds the PGlite database. `
			+ 'Stop it, seed, then restart (or seed Postgres with --pg).',
		)
	}

	const pglite = createPglite({ dataDir: './pg_dev_data' })
	await applyPgliteMigrations(pglite, { logger: LOGGER })
	await pglite.exec('SET search_path TO smx, public')
	close = () => pglite.close()
	return pglite as unknown as IPgClientLike
}

function assertDb(uri: string | undefined): asserts uri is string {
	if(!uri) {
		throw new Error('DB_URI is required with --pg')
	}
}
