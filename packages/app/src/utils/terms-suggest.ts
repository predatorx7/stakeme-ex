import type { TRANCHE_PRESETS } from '../consts.ts'

/**
 * IPO terms calculator. Pure and browser-safe (type-only import of consts), so
 * the launch form and the tests share one set of formulas. It only SUGGESTS:
 * the creator can edit every value.
 */

/** Investors should expect to get back this multiple of the goal. */
export const TARGET_INVESTOR_MULTIPLE = 1.3
/** Smallest and largest suggested share, in basis points (0.01% to 50%). */
export const MIN_SHARE_BPS = 1
export const MAX_SHARE_BPS = 5000
/** Above this share (basis points) of income we warn. */
export const HIGH_SHARE_BPS = 2000
/** Stake as a fraction of the goal, and the cap as a fraction of savings. */
export const STAKE_GOAL_FRACTION = 0.1
export const STAKE_SAVINGS_CAP = 0.5
export const MIN_STAKE = 1
/** `launch_ipo` rejects a stake under this fraction of the raise. */
export const MIN_STAKE_GOAL_FRACTION = 0.05
/** Goal / monthly income, in months, where the tranche bucket changes. */
export const SINGLE_TRANCHE_MAX_MONTHS = 6
export const THREE_TRANCHE_MAX_MONTHS = 24
/** Mirrors `DEFAULT_MIN_INCOME` in consts.ts; the page can override it. */
export const FALLBACK_MIN_INCOME = 1000
export const MAX_TERM_MONTHS = 120

export type TrancheKey = keyof typeof TRANCHE_PRESETS
export type ProofCadence = 'MONTHLY' | 'QUARTERLY'

export type TermsInput = {
	monthlyIncome: number
	goalAmount: number
	termMonths: number
	/** Expected yearly income growth, in percent. Defaults to 0. */
	annualGrowthPct?: number
	savings?: number
	incomeVaries?: boolean
	/** Lowest income a proof may show. Defaults to `FALLBACK_MIN_INCOME`. */
	minIncome?: number
}

export type TermsWarningCode =
	| 'share-high'
	| 'goal-unreachable'
	| 'below-min-income'

export type TermsWarning = { code: TermsWarningCode, message: string }

export type TermsSuggestion = {
	shareBps: number
	/** Same as `shareBps`, as a percent string for the form field. */
	sharePct: string
	/** First-month dividend at the suggested share. */
	monthlyDividend: string
	projectedTermIncome: string
	stake: string
	trancheSchedule: TrancheKey
	proofCadence: ProofCadence
	warnings: TermsWarning[]
	reasons: {
		shareBps: string
		monthlyDividend: string
		stake: string
		trancheSchedule: string
		proofCadence: string
	}
}

const money = (n: number) => (Math.round(n * 100) / 100).toFixed(2)
const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`

/** Sum of `monthlyIncome * (1 + g)^(k/12)` for k = 1..termMonths. */
export function projectIncome(
	monthlyIncome: number,
	termMonths: number,
	annualGrowthPct = 0,
) {
	const growth = 1 + annualGrowthPct / 100
	let total = 0
	for(let k = 1; k <= termMonths; k++) {
		total += monthlyIncome * growth ** (k / 12)
	}

	return total
}

/**
 * Suggests IPO terms. Returns `null` while the required inputs are not yet a
 * usable positive number (so a live form can show nothing).
 */
export function suggestTerms(input: TermsInput): TermsSuggestion | null {
	const {
		monthlyIncome,
		goalAmount,
		annualGrowthPct = 0,
		savings,
		incomeVaries = false,
		minIncome = FALLBACK_MIN_INCOME,
	} = input
	const termMonths = Math.trunc(input.termMonths)
	if(
		!(monthlyIncome > 0)
		|| !(goalAmount > 0)
		|| !Number.isFinite(monthlyIncome + goalAmount + annualGrowthPct)
		|| !(termMonths >= 1 && termMonths <= MAX_TERM_MONTHS)
		// Growth at or below -100% makes the power term meaningless.
		|| annualGrowthPct <= -100
	) {
		return null
	}

	const projected = projectIncome(monthlyIncome, termMonths, annualGrowthPct)
	const rawBps = Math.ceil(
		(goalAmount * TARGET_INVESTOR_MULTIPLE) / projected * 10000,
	)
	const shareBps = Math.min(MAX_SHARE_BPS, Math.max(MIN_SHARE_BPS, rawBps))
	const sharePct = shareBps / 100

	// Stake in whole cents.
	let stakeCents = Math.round(goalAmount * STAKE_GOAL_FRACTION * 100)
	if(savings !== undefined && Number.isFinite(savings) && savings >= 0) {
		stakeCents = Math.min(
			stakeCents,
			Math.floor(savings * STAKE_SAVINGS_CAP * 100),
		)
	}

	// The 5% floor wins over the savings cap: the launch is rejected below it.
	stakeCents = Math.max(
		stakeCents,
		MIN_STAKE * 100,
		Math.ceil(goalAmount * MIN_STAKE_GOAL_FRACTION * 100),
	)
	const stake = stakeCents / 100

	const months = goalAmount / monthlyIncome
	const trancheSchedule: TrancheKey = months <= SINGLE_TRANCHE_MAX_MONTHS
		? 'single'
		: months <= THREE_TRANCHE_MAX_MONTHS
			? '20-40-40'
			: '20-20-20-20-20'
	const proofCadence: ProofCadence = incomeVaries ? 'QUARTERLY' : 'MONTHLY'
	const dividend = monthlyIncome * shareBps / 10000

	const warnings: TermsWarning[] = []
	if(rawBps > MAX_SHARE_BPS) {
		warnings.push({
			code: 'goal-unreachable',
			message: 'This goal needs more than 50% of your income. '
				+ 'Try a longer term or a smaller goal.',
		})
	}

	if(shareBps > HIGH_SHARE_BPS) {
		warnings.push({
			code: 'share-high',
			message: `Holders would get ${sharePct}% of your income. `
				+ 'Over 20% is a lot to give up.',
		})
	}

	if(monthlyIncome < minIncome) {
		warnings.push({
			code: 'below-min-income',
			message: `Months under ${usd(minIncome)} are approved, but the `
				+ 'next payout stays locked. Your income is below that.',
		})
	}

	const reasons = {
		shareBps: `Covers ${usd(goalAmount)} plus a ${
			Math.round((TARGET_INVESTOR_MULTIPLE - 1) * 100)
		}% investor return from ${usd(projected)} of projected income.`,
		monthlyDividend: `${sharePct}% of ${usd(monthlyIncome)} a month.`,
		stake: savings === undefined
			? '10% of your goal, as skin in the game.'
			: '10% of your goal, capped at half your savings, min 5% of goal.',
		trancheSchedule: trancheSchedule === 'single'
			? 'Your goal is 6 months of income or less, so one payout is enough.'
			: trancheSchedule === '20-40-40'
				? 'Your goal is 6 to 24 months of income, so 3 payouts.'
				: 'Your goal is over 24 months of income, so 5 smaller payouts.',
		proofCadence: incomeVaries
			? 'Variable income is easier to prove every 3 months.'
			: 'Steady income can be proven every month.',
	}

	return {
		shareBps,
		sharePct: String(sharePct),
		monthlyDividend: money(dividend),
		projectedTermIncome: money(projected),
		stake: money(stake),
		trancheSchedule,
		proofCadence,
		warnings,
		reasons,
	}
}
