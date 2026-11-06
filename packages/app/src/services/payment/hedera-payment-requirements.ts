import { badRequest } from '@hapi/boom'
import assert from 'node:assert'

/**
 * Pure x402 helpers for the Hedera dividend loop. No SDK imports so the
 * browser and the unit tests can share them.
 *
 * One dividend = one `accepts` entry per holder (a "micro-stream"). The
 * creator's wallet signs ONE multi-transfer `TransferTransaction` that covers
 * all entries. The stock x402 `exact` Hedera facilitator verifies a single
 * `payTo` per transaction, so the server verifies and submits the multi-payee
 * transaction itself (hedera-payment-rail.ts).
 */

export const X402_VERSION = 2
const TINYBARS_PER_HBAR = 100_000_000n
const MICRO_PER_USDC = 1_000_000n
export const HBAR_ASSET = '0.0.0'

export type PaySplit = { wallet: string, amount: string }

export type PaymentRequirement = {
	scheme: 'exact'
	/** CAIP-2 id, e.g. `hedera:testnet`. */
	network: string
	/** `0.0.0` for HBAR or an HTS token id. */
	asset: string
	/** Smallest units (tinybars or token units), integer string. */
	amount: string
	/** Holder account: `0.0.<evm-address>` alias form. */
	payTo: string
	maxTimeoutSeconds: number
	extra: {
		/** Account that pays network fees (server operator). */
		feePayer: string
		/** Index of the holder in the split list. */
		split: number
		/** Holder EVM address. */
		wallet: string
	}
}

export type PaymentRequest = {
	x402Version: number
	resource: { url: string, description: string }
	accepts: PaymentRequirement[]
	/** Total in smallest units of `asset`. */
	total: string
	/** Dividend due in USD (USDC), decimal string. */
	totalUsd: string
	/** HBAR actually sent, decimal string; set when `asset` is HBAR. */
	totalHbar?: string
	/** Testnet conversion applied: HBAR per 1 USDC. */
	hbarPerUsdc?: string
	asset: string
	network: string
	dividendId: string
	/** `batched`: one transaction pays every `accepts` entry. */
	settlement: 'batched'
}

export type BuildRequirementsInput = {
	dividendId: string
	/** Dividend total in USDC, decimal string (6 dp max). */
	amount: string
	splits: PaySplit[]
	network: string
	/** `0.0.0` for HBAR or an HTS token id (6 decimals). */
	asset: string
	feePayer: string
	maxTimeoutSeconds?: number
	/**
	 * HBAR per 1 USDC (decimal, up to 8 dp). Required for HBAR; ignored for
	 * tokens, which pay 1:1.
	 */
	hbarPerUsdc?: string
}

/** Pure: decimal string (<= 6 dp) to micro units. */
export function toMicro(amount: string) {
	const match = /^(\d+)(?:\.(\d{1,6}))?$/.exec(amount.trim())
	assert(match, badRequest(`Invalid amount "${amount}"`))
	return BigInt(match[1]) * 1_000_000n
		+ BigInt((match[2] ?? '').padEnd(6, '0'))
}

/** Pure: EVM address to the Hedera alias account form `0.0.<40 hex>`. */
export function aliasAccount(wallet: string) {
	assert(/^0x[0-9a-fA-F]{40}$/.test(wallet), badRequest('Bad holder wallet'))
	return `0.0.${wallet.slice(2).toLowerCase()}`
}

/** Pure: HBAR-per-USDC decimal string to tinybars per 1 USDC. */
export function parseHbarRate(rate: string) {
	const match = /^(\d+)(?:\.(\d{1,8}))?$/.exec(rate.trim())
	assert(match, badRequest(`Invalid HBAR rate "${rate}"`))
	const tinybars = BigInt(match[1]) * TINYBARS_PER_HBAR
		+ BigInt((match[2] ?? '').padEnd(8, '0'))
	assert(tinybars > 0n, badRequest('HBAR rate must be positive'))
	return tinybars
}

/** Pure: tinybars to an HBAR decimal string (trailing zeros trimmed). */
export function formatHbar(tinybars: bigint) {
	const whole = tinybars / TINYBARS_PER_HBAR
	const frac = (tinybars % TINYBARS_PER_HBAR).toString().padStart(8, '0')
		.replace(/0+$/, '')
	return frac ? `${whole}.${frac}` : whole.toString()
}

/**
 * Pure: converts per-holder micro-USDC to tinybars at `hbarPerUsdc`. The total
 * is the rounded conversion of the whole dividend; each holder gets the floor
 * of their share and the leftover tinybars go to the largest remainders, so
 * the parts always sum exactly to the total.
 */
export function convertToTinybars(micro: bigint[], hbarPerUsdc: string) {
	const rate = parseHbarRate(hbarPerUsdc)
	const sum = micro.reduce((a, b) => a + b, 0n)
	const total = (sum * rate + MICRO_PER_USDC / 2n) / MICRO_PER_USDC
	const out = micro.map((m) => m * rate / MICRO_PER_USDC)
	let left = total - out.reduce((a, b) => a + b, 0n)
	const order = micro
		.map((m, i) => ({ i, rem: m * rate % MICRO_PER_USDC }))
		.sort((a, b) => (a.rem === b.rem ? a.i - b.i : a.rem > b.rem ? -1 : 1))
	for(let k = 0; left > 0n; k = (k + 1) % order.length, left--) {
		out[order[k].i]++
	}

	return out
}

/**
 * Pure: per-holder micro amounts that sum exactly to `amount`. Rounding dust
 * (the SQL split floors each holder) goes to the largest holder, so the total
 * paid always equals the dividend.
 */
export function allocateSplits(amount: string, splits: PaySplit[]) {
	assert(splits.length > 0, badRequest('Dividend has no holders to pay'))
	const target = toMicro(amount)
	const micro = splits.map((s) => toMicro(s.amount))
	const diff = target - micro.reduce((a, b) => a + b, 0n)
	// Over 1 unit of dust per holder means wrong splits, not rounding.
	assert(
		diff >= -BigInt(splits.length) && diff <= BigInt(splits.length),
		badRequest('Splits do not add up to the dividend'),
	)
	if(diff !== 0n) {
		let largest = 0
		for(const [i, m] of micro.entries()) {
			if(m > micro[largest]) {
				largest = i
			}
		}

		micro[largest] += diff
		assert(micro[largest] >= 0n, badRequest('Splits do not add up'))
	}

	return micro
}

/** Pure: dividend splits to x402 payment requirements (one per holder). */
export function buildPaymentRequest(input: BuildRequirementsInput) {
	const micro = allocateSplits(input.amount, input.splits)
	const hbar = input.asset === HBAR_ASSET
	if(hbar) {
		assert(input.hbarPerUsdc, badRequest('HBAR rate is required'))
	}

	const units = hbar ? convertToTinybars(micro, input.hbarPerUsdc!) : micro
	// A holder whose share rounds to zero tinybars has nothing to receive.
	const accepts = input.splits
		.map((s, i): PaymentRequirement => ({
			scheme: 'exact',
			network: input.network,
			asset: input.asset,
			amount: units[i].toString(),
			payTo: aliasAccount(s.wallet),
			maxTimeoutSeconds: input.maxTimeoutSeconds ?? 120,
			extra: { feePayer: input.feePayer, split: i, wallet: s.wallet },
		}))
		.filter((r) => BigInt(r.amount) > 0n)
	assert(accepts.length > 0, badRequest('Dividend is too small to pay'))
	const total = accepts.reduce((a, r) => a + BigInt(r.amount), 0n)
	const request: PaymentRequest = {
		x402Version: X402_VERSION,
		resource: {
			url: `/dividends/${input.dividendId}/payment`,
			description:
				`Dividend ${input.dividendId} paid to ${accepts.length} holders`,
		},
		accepts,
		total: total.toString(),
		totalUsd: input.amount,
		...(hbar && {
			totalHbar: formatHbar(total),
			hbarPerUsdc: input.hbarPerUsdc,
		}),
		asset: input.asset,
		network: input.network,
		dividendId: input.dividendId,
		settlement: 'batched',
	}
	return request
}

/** A transfer decoded from a signed transaction: negative = debit. */
export type DecodedTransfer = { account: string, amount: bigint }

/**
 * Pure: checks the signed transaction pays exactly what the request asks.
 * Credits must equal the requirements (merged per `payTo`), the payer must be
 * the single debit, and nothing else may move (so a creator cannot sneak in a
 * transfer from the fee payer). Returns the payer account id.
 */
export function assertTransfersMatch(
	request: Pick<PaymentRequest, 'accepts'>,
	transfers: DecodedTransfer[],
) {
	const expected = new Map<string, bigint>()
	for(const r of request.accepts) {
		expected.set(r.payTo, (expected.get(r.payTo) ?? 0n) + BigInt(r.amount))
	}

	const credits = new Map<string, bigint>()
	let payer = ''
	let debit = 0n
	for(const t of transfers) {
		if(t.amount < 0n) {
			assert(!payer || payer === t.account, badRequest('Multiple payers'))
			payer = t.account
			debit += -t.amount
		} else if(t.amount > 0n) {
			credits.set(t.account, (credits.get(t.account) ?? 0n) + t.amount)
		}
	}

	assert(payer, badRequest('Payment has no payer'))
	assert(
		credits.size === expected.size
			&& [...expected].every(([k, v]) => credits.get(k) === v),
		badRequest('Payment transfers do not match the request'),
	)
	let total = 0n
	for(const v of expected.values()) {
		total += v
	}

	assert(debit === total, badRequest('Payer debit does not match the total'))
	return payer
}
