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
	/** Reclaim organization id the result is addressed to; null in demo. */
	orgId?: string | null
}

/** Remote state of a verification session (mirrors the Reclaim status). */
export type ProofRequestStatus =
	| 'PENDING' | 'SUCCESS' | 'REJECTED' | 'ERROR' | 'CANCELLED' | 'EXPIRED'

export type VerifiedIncome = {
	/** Stable id used to dedupe proofs. */
	proofId: string
	provider: string
	/** Verified income in USDC, as a decimal string (6 dp max). */
	amount: string
	/**
	 * Deposit date (`YYYY-MM-DD`, UTC) from the proof. Absent ("unknown") for
	 * demo fixtures and providers that don't extract it.
	 */
	depositDate?: string
	/** Context echoed from the session (creator id). */
	context: string
	/** Full proof JSON, stored for audit. */
	raw: unknown
}

export type IncomeAuditInput = {
	creatorId?: string
	ticker: string
	shareBps: number
	minIncome: string
	period: number
	termsHash: string
	/** Storage ref of the L-ISA terms, echoed into the audit log. */
	termsRef?: string
	/**
	 * Reporting period the deposit must fall in (inclusive `YYYY-MM-DD`, UTC).
	 * Absent: no date check.
	 */
	window?: { from: string, to: string }
	income: VerifiedIncome
}

export type IncomeAudit = {
	approved: boolean
	/** Amount the auditor accepts as income, decimal string. */
	verifiedAmount: string
	reasoning: string
	/** Model id, or `rules-engine` for the fallback. */
	model: string
	/** 0G Storage root hash (or `local:<sha256>`) of the audit log. */
	logRef: string | null
	/**
	 * `0g-router`, `0g-compute`, `rules` (offline dev fallback) or `pre-check`
	 * (a deterministic denial made before any 0G call; 0G did not decide).
	 */
	engine?: 'rules' | '0g-router' | '0g-compute' | 'pre-check'
	/** 0G Router request id (`x_0g_trace.request_id`). */
	requestId?: string
	/** On-chain address of the TEE provider that served the request. */
	providerAddress?: string
	/** `true` only when the Router verified the TEE signature. */
	teeVerified?: boolean
	/** Trust tier the request was restricted to (`private`, `verified`). */
	trustMode?: string
	/** Router charge for the request, in micro-USD. */
	costMicroUsd?: string
}

export type LisaTerms = {
	ticker: string
	displayName: string
	shareBps: number
	termMonths: number
	targetRaise: string
	stakeAmount: string
	trancheBps: number[]
	/** Days between proof deadlines; part of the terms when set. */
	proofCadenceDays?: number
	worldIdNullifier: string
	creatorWallet: string
}

export type StoredTerms = {
	/** Storage reference of the terms (0G root hash, or `local:<sha256>`). */
	termsRef: string
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
	| 'freezeEscrow'
	| 'unfreezeEscrow'
	| 'closeRaise'
	| 'reclaimStake'

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
	deployed?: {
		isa: string
		token: string
		atsToken?: string
		/** CreatorPool clone; unset in simulated mode. */
		pool?: string
	}
	error?: string
}

export type DividendSplit = { wallet: string, amount: string }

export type DividendStreamResult = {
	status: 'CONFIRMED' | 'SIMULATED'
	/** One reference per payment (tx hash or x402 receipt id). */
	receipts: string[]
}

/** Allows a rail to expose a signed-payment flow (x402) to the browser. */
export type PaymentRequestInput = {
	dividendId: string
	ticker: string
	amount: string
	splits: DividendSplit[]
}
