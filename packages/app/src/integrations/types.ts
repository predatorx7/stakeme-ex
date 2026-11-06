/**
 * Contract between the backend (routes, worker) and the sponsor integrations.
 * Backend code imports only these types and the functions re-exported from
 * `./index.ts`. Every function has a demo fallback when its env vars are
 * missing (see docs/integrations/*.md), so the app runs with no keys.
 */

export type WorldIdVerifyInput = {
	/** Raw IDKit result posted by the browser (JSON). */
	proof: unknown
	/** Wallet address the proof is bound to (signal). */
	signal: string
}

export type WorldIdVerifyResult = {
	/** Decimal string nullifier, unique per human per action. */
	nullifier: string
	/** True when verified by the Simulator or demo fallback. */
	simulated: boolean
}

export type ReclaimSessionInput = {
	ticker: string
	/** Absolute URL Reclaim posts the proof to. */
	callbackUrl: string
	/** Opaque context echoed back in the proof (creator id). */
	context: string
}

export type ReclaimSession = {
	sessionId: string
	requestUrl: string
	statusUrl: string
}

export type VerifiedIncome = {
	/** Stable id used to dedupe proofs. */
	proofId: string
	provider: string
	/** Verified income in USDC, as a decimal string (6 dp max). */
	amount: string
	/** Context echoed from the session (creator id). */
	context: string
	/** Full proof JSON, stored for audit. */
	raw: unknown
}

export type IncomeAuditInput = {
	ticker: string
	shareBps: number
	minIncome: string
	period: number
	termsHash: string
	income: VerifiedIncome
}

export type IncomeAudit = {
	approved: boolean
	/** Amount the auditor accepts as income, decimal string. */
	verifiedAmount: string
	reasoning: string
	/** Model id, or `rules-engine` for the fallback. */
	model: string
	/** 0G Storage root hash of the audit log, when uploaded. */
	logRef: string | null
}

export type LisaTerms = {
	ticker: string
	displayName: string
	shareBps: number
	termMonths: number
	targetRaise: string
	stakeAmount: string
	trancheBps: number[]
	worldIdNullifier: string
	creatorWallet: string
}

export type StoredTerms = {
	/** Arkiv entity key, or `local:<hash>` in demo mode. */
	entityKey: string
	/** sha256 hex of canonical terms JSON. */
	termsHash: string
}

export type ChainFn =
	| 'createISA'
	| 'initializeIPO'
	| 'invest'
	| 'unlockNextTranche'
	| 'distributeDividend'
	| 'executeLiquidation'

export type ChainJob = {
	id: string
	fn: ChainFn
	/** JSON args as stored in `smx.chain_jobs.args`. */
	args: Record<string, unknown>
	contractAddress: string | null
}

export type ChainJobResult = {
	status: 'CONFIRMED' | 'SIMULATED' | 'FAILED'
	txHash: string | null
	/** Set for `createISA`: deployed addresses. */
	deployed?: { isa: string, token: string }
	error?: string
}

export type DividendSplit = { wallet: string, amount: string }

export type DividendStreamResult = {
	status: 'CONFIRMED' | 'SIMULATED'
	/** One reference per payment (tx hash or x402 receipt id). */
	receipts: string[]
}
