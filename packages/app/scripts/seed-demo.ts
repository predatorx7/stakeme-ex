#!/usr/bin/env node
/**
 * Seeds the demo: 8 creators and 15 investors. MUSH, KART and ROHAN have
 * one approved proof and a paid dividend (audited by the real 0G Private
 * Computer agent, so `DEMO_MODE=1` and the 0G Router keys are required), RAVI
 * is a fresh med-student IPO for the live happy path, RAHUL is live and
 * overdue (ready for `POST /api/trigger-default`), the rest are live IPOs
 * with holders, trades and a 7-day chart. Terms and audit logs upload to 0G
 * Storage through the outbox.
 *
 *   npm run seed:demo          PGlite dev database (pg_dev_data)
 *   npm run seed:demo -- --pg  Postgres at DB_URI (`npm run db:up`)
 *
 * Everything goes through the SQL functions, so the data obeys the same rules
 * as the app. Idempotent: creators that exist are skipped. PGlite is a
 * single-process database, so stop `npm run dev` first (or seed, then
 * dev).
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Pool } from 'pg'
import { DEFAULT_TRANCHE_BPS, PORT } from '../src/consts.ts'
import {
	demoWorldIdNullifier,
	demoWorldIdProof
} from '../src/integrations/world-id.ts'
import { LOGGER } from '../src/logger.ts'
import {
	getCreatorIdByTicker,
	invest,
	launchIpo,
	payDividend,
	seedSetOverdue,
	seedSpreadHistory,
	seedUpsertUser,
	trade,
} from '../src/queries.ts'
import { prepareTerms } from '../src/services/index.ts'
import type { IPgClientLike } from '../src/types/index.ts'
import { runIncomeAudit } from '../src/utils/income-audit.ts'
import { processChainJobs } from '../src/worker/chain-jobs.ts'
import { processStorageUploads } from '../src/worker/storage-uploads.ts'
import { applyPgliteMigrations, createPglite } from '../tests/pglite.ts'

const useDocker = process.argv.includes('--pg')

/**
 * Real, signable demo wallets: `users.json` from the presentation folder
 * (`SMX_DEMO_USERS`, default `../stakeme-presentation/users.json` next to the
 * repo). Without the file the placeholder wallets below are used.
 */
const DEMO_USERS = loadDemoUsers()

const INVESTORS = DEMO_USERS
	? DEMO_USERS.filter((a) => a.role === 'investor').map(wallet)
	: [
		'0x1111111111111111111111111111111111111111',
		'0x2222222222222222222222222222222222222222',
		'0x3333333333333333333333333333333333333333',
		'0x4444444444444444444444444444444444444444',
	]

type Creator = {
	ticker: string
	name: string
	headline: string
	wallet: string
	nullifier: string
	raise: string
	stake: string
	/** Income (USDC) of the one approved, 0G-audited proof, if any. */
	proof?: string
	/** Investment per holder, in USDC, starting at INVESTOR offset. */
	holders: string[]
	trades: number
	/** Skip the 7-day history (fresh IPO). */
	fresh?: boolean
	overdue?: boolean
}

const CREATORS: Creator[] = [
	{
		ticker: 'MUSH',
		name: 'Mushaheed',
		headline: 'Software developer building open-source dev tools.',
		wallet: creatorWallet(
			'MUSH', '0xa000000000000000000000000000000000000001',
		),
		// The launch page's "Simulate Sybil" fixture maps to this World ID, so
		// it reads as a second IPO by the same human (409). Read-only: nothing
		// is blacklisted; only liquidation bans a nullifier.
		nullifier: demoWorldIdNullifier(demoWorldIdProof('sybil', '')),
		raise: '20000',
		stake: '2000',
		proof: '5000',
		holders: ['3000', '2500', '2000', '1500'],
		trades: 14,
	},
	{
		ticker: 'RAVI',
		name: 'Ravi',
		headline: 'Medical student funding the final two years of school.',
		wallet: creatorWallet(
			'RAVI', '0xa000000000000000000000000000000000000002',
		),
		nullifier: '710000000000000000000002',
		raise: '15000',
		stake: '1500',
		holders: ['1500', '1000'],
		trades: 0,
		fresh: true,
	},
	{
		ticker: 'RAHUL',
		name: 'Rahul',
		headline: 'Freelance designer. Has stopped sending proofs.',
		wallet: creatorWallet(
			'RAHUL', '0xa000000000000000000000000000000000000003',
		),
		nullifier: '710000000000000000000003',
		raise: '10000',
		stake: '1000',
		holders: ['3000', '2500', '2000', '1500'],
		trades: 0,
		overdue: true,
	},
	{
		ticker: 'PRIYA',
		name: 'Priya',
		headline: 'UX designer shipping design systems for fintech startups.',
		wallet: creatorWallet(
			'PRIYA', '0xa000000000000000000000000000000000000004',
		),
		nullifier: '710000000000000000000004',
		raise: '8000',
		stake: '800',
		holders: ['900', '800', '600', '500', '400'],
		trades: 9,
	},
	{
		ticker: 'KART',
		name: 'Karthik',
		headline: 'Founder of a Chennai logistics-tech startup, pre-seed.',
		wallet: creatorWallet(
			'KART', '0xa000000000000000000000000000000000000005',
		),
		nullifier: '710000000000000000000005',
		raise: '12000',
		stake: '1200',
		proof: '8000',
		holders: ['1200', '1000', '900', '700', '600', '500'],
		trades: 12,
	},
	{
		ticker: 'ANANYA',
		name: 'Ananya',
		headline: 'Indie musician from Pune funding her debut album.',
		wallet: creatorWallet(
			'ANANYA', '0xa000000000000000000000000000000000000006',
		),
		nullifier: '710000000000000000000006',
		raise: '6000',
		stake: '600',
		holders: ['700', '600', '500', '400'],
		trades: 8,
	},
	{
		ticker: 'ROHAN',
		name: 'Rohan',
		headline: 'Data scientist in Hyderabad building open climate models.',
		wallet: creatorWallet(
			'ROHAN', '0xa000000000000000000000000000000000000007',
		),
		nullifier: '710000000000000000000007',
		raise: '9000',
		stake: '900',
		proof: '3000',
		holders: ['1000', '900', '800', '600', '500'],
		trades: 10,
	},
	{
		ticker: 'TIFFIN',
		name: 'Lakshmi',
		headline: 'Chef running a Mumbai cloud kitchen, opening three more.',
		wallet: creatorWallet(
			'TIFFIN', '0xa000000000000000000000000000000000000008',
		),
		nullifier: '710000000000000000000008',
		raise: '7000',
		stake: '700',
		holders: ['800', '700', '500', '400'],
		trades: 7,
	},
]

function creatorWallet(ticker: string, fallback: string) {
	const found = DEMO_USERS?.find(
		(a) => a.role === 'creator' && a.ticker === ticker,
	)
	return found ? wallet(found) : fallback
}

function wallet(a: { address: string }) {
	// better-auth stores SIWE addresses lowercased
	return a.address.toLowerCase()
}

function loadDemoUsers() {
	const repoRoot = fileURLToPath(new URL('../../..', import.meta.url))
	const path = resolve(
		repoRoot,
		process.env.SMX_DEMO_USERS || '../stakeme-presentation/users.json',
	)
	if(!existsSync(path)) {
		return undefined
	}

	const json = JSON.parse(readFileSync(path, 'utf8')) as {
		accounts: {
			role: string
			name: string
			ticker?: string
			address: string
		}[]
	}
	return json.accounts
}

let close = async() => {}

const pg = await connect()
try {
	await seedInvestors()
	for(const [index, c] of CREATORS.entries()) {
		await seedCreator(c, index)
	}

	// Settle the queued onchain calls now, so the demo opens with no pending
	// badges (simulated mode produces deterministic fake hashes).
	const settled = await processChainJobs(pg)
	LOGGER.info({ settled }, 'chain jobs settled')
	// Terms and audit logs are queued in the storage outbox with `local:` refs;
	// upload them to 0G Storage now, which swaps in the root hashes.
	const uploaded = await processStorageUploads(pg)
	LOGGER.info({ uploaded }, 'storage uploads settled')
	LOGGER.info('demo seeded: MUSH, RAVI, RAHUL')
} finally {
	await close()
}

/** Gives every signable investor wallet a named user record. */
async function seedInvestors() {
	for(const a of DEMO_USERS?.filter((u) => u.role === 'investor') ?? []) {
		await seedUpsertUser.run(
			{
				email: `${a.name.toLowerCase()}@demo.smx`,
				name: a.name,
				wallet: wallet(a),
			},
			pg,
		)
	}
}

async function seedCreator(c: Creator, index: number) {
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
	const terms = prepareTerms({
		ticker: c.ticker,
		displayName: c.name,
		shareBps: 500,
		termMonths: 60,
		targetRaise: c.raise,
		stakeAmount: c.stake,
		trancheBps: DEFAULT_TRANCHE_BPS,
		worldIdNullifier: c.nullifier,
		creatorWallet: c.wallet,
	})
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
			terms_ref: terms.termsRef,
			terms_hash: terms.termsHash,
			terms_document: terms.document,
			chain_id: 296,
		},
		pg,
	)

	// Holders rotate through the investor list so each creator has a
	// different cast. MUSH and RAHUL start at the first investor.
	const rotate = index < 3 ? 0 : (index - 2) * 3
	const holders = c.holders.map(
		(usdc, i) => ({ usdc, wallet: INVESTORS[(rotate + i) % INVESTORS.length] }),
	)
	for(const h of holders) {
		await invest.run(
			{ ticker: c.ticker, wallet: h.wallet, usdc_amount: h.usdc },
			pg,
		)
	}

	if(c.proof) {
		const [row] = await getCreatorIdByTicker.run({ ticker: c.ticker }, pg)
		// The real pipeline: the demo fixture is verified, then audited by the
		// 0G Private Computer agent (no rules-engine fallback).
		const outcome = await runIncomeAudit(pg, {
			demo: true,
			amount: c.proof,
			context: row.id,
			id: `demo-proof-${c.ticker.toLowerCase()}-0`,
		})
		if(outcome.kind !== 'audited') {
			throw new Error(
				`${c.ticker} income proof not audited (${outcome.kind}): `
				+ 'is 0G reachable?',
			)
		}

		const dividend = (outcome.result as { dividend?: { id: string } })
			.dividend
		if(dividend) {
			await payDividend.run(
				{ dividend_id: dividend.id, viewer_id: user.id }, pg,
			)
		}
	}

	const holderWallets = new Set(holders.map((h) => h.wallet))
	for(let i = 0; i < c.trades; i++) {
		const wallet = INVESTORS[(rotate + i) % INVESTORS.length]
		const sell = i % 3 === 2 && holderWallets.has(wallet)
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

	if(!c.fresh) {
		await seedSpreadHistory.run({ ticker: c.ticker, days: 7 }, pg)
	}

	if(c.overdue) {
		await seedSetOverdue.run({ ticker: c.ticker, hours: 2 }, pg)
	}

	await slimChainJobs(c.ticker)
	LOGGER.info({ ticker: c.ticker }, 'seeded creator')
}

/**
 * Keeps the onchain footprint small (each Hedera call costs HBAR): the
 * per-investor `invest` jobs collapse into one with the summed amount and the
 * dividend distribution is dropped. createISA, initializeIPO and
 * unlockNextTranche stay. Holdings, trades and prices live in Postgres only.
 */
async function slimChainJobs(ticker: string) {
	const [row] = await getCreatorIdByTicker.run({ ticker }, pg)
	const id = [row.id]
	await pg.query(
		`UPDATE smx.chain_jobs SET args = jsonb_set(args, '{amount}', to_jsonb((
			SELECT sum((a.args->>'amount')::numeric)::text FROM smx.chain_jobs a
			WHERE a.creator_id = $1 AND a.fn = 'invest' AND a.status = 'QUEUED'
		)))
		WHERE id = (
			SELECT x.id FROM smx.chain_jobs x
			WHERE x.creator_id = $1 AND x.fn = 'invest' AND x.status = 'QUEUED'
			ORDER BY x.seq LIMIT 1
		)`,
		id,
	)
	await pg.query(
		`DELETE FROM smx.chain_jobs d
		WHERE d.creator_id = $1 AND d.status = 'QUEUED' AND (
			d.fn = 'distributeDividend'
			OR (d.fn = 'invest' AND d.id <> (
				SELECT x.id FROM smx.chain_jobs x
				WHERE x.creator_id = $1 AND x.fn = 'invest' AND x.status = 'QUEUED'
				ORDER BY x.seq LIMIT 1
			))
		)`,
		id,
	)
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
