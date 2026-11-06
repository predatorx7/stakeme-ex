import { randomBytes } from 'node:crypto'
import type { MockBank } from '../types/index.ts'

/**
 * Mock bank (simulates HDFC) for the Reclaim provider. Reclaim's attestor must
 * prove an auth-bound request, so the statement API needs a session cookie.
 * Any non-empty username and password is accepted. Sessions live in memory
 * (demo only): a restart logs everyone out.
 */
export const BANK_COOKIE = 'smx_bank_session'
const SESSION_TTL_MS = 12 * 60 * 60 * 1000
const MAX_SESSIONS = 1000
const SESSIONS = new Map<string, {
	holderName: string
	scenario: BankScenario
	expiresAt: number
}>()

/** Creates a session for `username` and returns its opaque token. */
export function createBankSession(
	username: string,
	scenario: BankScenario = DEFAULT_SCENARIO,
) {
	const now = Date.now()
	for(const [token, s] of SESSIONS) {
		if(s.expiresAt < now || SESSIONS.size > MAX_SESSIONS) {
			SESSIONS.delete(token)
		}
	}

	const token = randomBytes(24).toString('base64url')
	SESSIONS.set(token, {
		holderName: username.trim().slice(0, 60) || 'Demo Customer',
		scenario,
		expiresAt: now + SESSION_TTL_MS,
	})
	return token
}

/** Returns the session for the request's cookie header, if still valid. */
export function getBankSession(cookieHeader: string | undefined) {
	const token = cookieHeader
		?.split(';')
		.map((c) => c.trim().split('='))
		.find(([name]) => name === BANK_COOKIE)?.[1]
	const session = token ? SESSIONS.get(token) : undefined
	if(!session || session.expiresAt < Date.now()) {
		return undefined
	}

	return session
}

const DAY_MS = 86_400_000
/** Balance before any income row; the default scenario totals $12,957.50. */
const BASE_BALANCE_CENTS = 795_750

/**
 * Income scenarios the login page offers. `demoAmount` is what the Hub's demo
 * proof reports for it; null when a fixture can't express it (it carries no
 * date).
 */
export const BANK_SCENARIOS = [
	{
		id: 'salary',
		label: 'Salary on time',
		hint: 'One $5,000 deposit.',
		demoAmount: '5000.00',
	},
	{
		id: 'low',
		label: 'Low month',
		hint: 'One $800 deposit. Approved, but the next payout stays locked.',
		demoAmount: '800.00',
	},
	{
		id: 'big',
		label: 'Big month',
		hint: 'One $25,000 deposit.',
		demoAmount: '25000.00',
	},
	{
		id: 'several',
		label: 'Several deposits',
		hint: 'Three deposits ($1,200, $2,300, $1,500). The proof shows the total.',
		demoAmount: '5000.00',
	},
	{
		id: 'none',
		label: 'No income',
		hint: 'No deposits. Approved with no dividend; payout stays locked.',
		demoAmount: '0.00',
	},
	{
		id: 'late',
		label: 'Late deposit',
		hint: 'One $5,000 deposit dated 40 days ago. Denied: outside the period.',
		demoAmount: null,
	},
] as const

export type BankScenario = (typeof BANK_SCENARIOS)[number]['id']

export const DEFAULT_SCENARIO: BankScenario = 'salary'

export function parseScenario(value: unknown): BankScenario {
	return BANK_SCENARIOS.find((s) => s.id === value)?.id ?? DEFAULT_SCENARIO
}

type Txn = MockBank['transactions'][number]

/**
 * The statement for `scenario`. The Reclaim provider proves
 * `$.transactions[0].amount` and `$.transactions[0].date`, so the first row is
 * always the proven DEPOSIT (amount, date, field order unchanged). With
 * several deposits it is the month's total, followed by the separate rows.
 * The default scenario is the original statement: $5,000.00 today and a
 * withdrawal dated yesterday.
 */
export function buildStatement(
	holderName: string,
	scenario: BankScenario = DEFAULT_SCENARIO,
	now = Date.now(),
): MockBank {
	const day = (ago: number) => new Date(now - ago * DAY_MS)
		.toISOString().slice(0, 10)
	// The withdrawal is dated a day earlier so the deposit's date is unique in
	// the response: the Reclaim provider proves the deposit date by value.
	const withdrawal: Txn = {
		id: 'txn_0002',
		date: day(1),
		description: 'Cloud hosting',
		amount: '42.50',
		type: 'WITHDRAWAL',
	}
	const income = (
		amount: string, description: string, ago = 0,
	): Txn => ({
		id: 'txn_0001',
		date: day(ago),
		description,
		amount,
		type: 'DEPOSIT',
	})
	const rows: Record<BankScenario, Txn[]> = {
		salary: [income('5000.00', 'Acme Studio freelance income'), withdrawal],
		low: [income('800.00', 'Acme Studio freelance income'), withdrawal],
		big: [income('25000.00', 'Acme Studio freelance income'), withdrawal],
		several: [
			income('5000.00', 'Total deposits this month (3 deposits)'),
			{ ...income('1200.00', 'Acme Studio freelance income', 2),
				id: 'txn_0003' },
			{ ...income('2300.00', 'Northwind retainer', 3), id: 'txn_0004' },
			{ ...income('1500.00', 'Tip jar payout', 4), id: 'txn_0005' },
			withdrawal,
		],
		none: [income('0.00', 'No deposits this month'), withdrawal],
		late: [income('5000.00', 'Acme Studio freelance income', 40), withdrawal],
	}
	const transactions = rows[scenario]
	const cents = BASE_BALANCE_CENTS
		+ Math.round(Number(transactions[0].amount) * 100)
	return {
		account: 'Savings Account XXXX4242',
		holderName,
		balance: (cents / 100).toFixed(2),
		transactions,
	}
}
