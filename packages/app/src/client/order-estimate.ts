/// <reference lib="dom" />

/**
 * Order ticket estimate. `estimateSwap` mirrors `amm_swap` in `sql/ddl.sql`
 * digit for digit (constant product, input fee stays in the pool, output
 * truncated to 18 decimals for tokens and 6 for USDC), using BigInt so no
 * float drift. The DOM wiring at the bottom drives `[data-order-ticket]`.
 */

export type Side = 'BUY' | 'SELL'

export type PoolReserves = {
	usdcReserve: string
	tokenReserve: string
	/** Defaults to 30 (0.3%), the fee `amm_swap` charges. */
	feeBps?: number
}

export type SwapEstimate =
	| { ok: false, reason: 'empty' | 'invalid' | 'too-small' | 'no-pool' }
	| {
		ok: true
		/** Output of the swap: tokens for BUY, USDC for SELL. */
		out: string
		/** Fee in the input currency (USDC for BUY, tokens for SELL). */
		fee: string
		/** Execution price, USDC per token, as the trade row records it. */
		price: string
		/** Pool price before the trade, USDC per token. */
		spotPrice: string
		/** Execution price vs spot in percent, fee included, 4 decimals. */
		impactPct: string
		/** `out` less the slippage allowance, truncated like `out`. */
		minOut: string
	}

const SCALE_DIGITS = 24
const SCALE = 10n ** BigInt(SCALE_DIGITS)
const TOKEN_DIGITS = 18
const USDC_DIGITS = 6
const BPS = 10_000n
const AMOUNT_RE = /^(\d+)(?:\.(\d{1,18}))?$/

/** Decimal string to a BigInt scaled by 10^24; null when not a plain amount. */
function parse(value: string) {
	const m = AMOUNT_RE.exec(value.trim())
	if(!m) {
		return null
	}

	return BigInt(m[1]) * SCALE
		+ BigInt((m[2] || '').padEnd(SCALE_DIGITS, '0'))
}

/** Truncate (like SQL `trunc(x, n)`) a scaled value to n decimals. */
function trunc(value: bigint, digits: number) {
	const unit = 10n ** BigInt(SCALE_DIGITS - digits)
	return value - value % unit
}

/** Scaled value to a decimal string without trailing zeros. */
function format(value: bigint, digits = SCALE_DIGITS) {
	const t = trunc(value, digits)
	const whole = (t / SCALE).toString()
	const frac = (t % SCALE).toString().padStart(SCALE_DIGITS, '0')
		.slice(0, digits).replace(/0+$/, '')
	return frac ? `${whole}.${frac}` : whole
}

/**
 * Estimate a swap against the pool.
 *
 * @param slippageBps allowed slippage in basis points, 0 to 9999.
 */
export function estimateSwap(
	{ side, amountIn, pool, slippageBps = 0 }: {
		side: Side
		amountIn: string
		pool: PoolReserves
		slippageBps?: number
	},
): SwapEstimate {
	if(!amountIn.trim()) {
		return { ok: false, reason: 'empty' }
	}

	const amount = parse(amountIn)
	if(amount === null || amount <= 0n) {
		return { ok: false, reason: 'invalid' }
	}

	const usdcReserve = parse(pool.usdcReserve)
	const tokenReserve = parse(pool.tokenReserve)
	if(!usdcReserve || !tokenReserve) {
		return { ok: false, reason: 'no-pool' }
	}

	const feeBps = BigInt(pool.feeBps ?? 30)
	const slip = Math.min(Math.max(Math.trunc(slippageBps), 0), 9999)
	const keepBps = BPS - BigInt(slip)
	const fee = amount * feeBps / BPS
	const eff = amount - fee

	const buy = side === 'BUY'
	const [reserveIn, reserveOut] = buy
		? [usdcReserve, tokenReserve]
		: [tokenReserve, usdcReserve]
	const outDigits = buy ? TOKEN_DIGITS : USDC_DIGITS
	const out = trunc(reserveOut * eff / (reserveIn + eff), outDigits)
	if(out <= 0n) {
		return { ok: false, reason: 'too-small' }
	}

	// The trade row stores trunc(usdc / tokens, 18), with the USDC leg of a
	// buy truncated to 6 decimals.
	const usdc = buy ? trunc(amount, USDC_DIGITS) : out
	const tokens = buy ? out : amount
	const price = trunc(usdc * SCALE / tokens, TOKEN_DIGITS)
	const spot = usdcReserve * SCALE / tokenReserve
	const impact = spot
		? (buy ? price - spot : spot - price) * 100n * SCALE / spot
		: 0n

	return {
		ok: true,
		out: format(out),
		fee: format(fee),
		price: format(price),
		spotPrice: format(spot, TOKEN_DIGITS),
		impactPct: format(impact > 0n ? impact : 0n, 4),
		minOut: format(trunc(out * keepBps / BPS, outDigits)),
	}
}

/**
 * Slippage percent text ("0.5", "1.25") to basis points; null when empty,
 * malformed, zero or above 50%.
 */
export function percentToBps(value: string) {
	const m = /^(\d{1,2})(?:\.(\d{1,2}))?$/.exec(value.trim())
	if(!m) {
		return null
	}

	const bps = Number(m[1]) * 100 + Number((m[2] || '').padEnd(2, '0'))
	return bps > 0 && bps <= 5000 ? bps : null
}

/** Group digits and cap decimals for display, e.g. "1234.5" -> "1,234.50". */
export function displayAmount(
	value: string,
	minDigits: number,
	maxDigits: number,
) {
	const [whole, frac = ''] = value.split('.')
	const digits = frac.slice(0, maxDigits).replace(/0+$/, '')
		.padEnd(minDigits, '0')
	const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
	return digits ? `${grouped}.${digits}` : grouped
}

// ── DOM wiring ─────────────────────────────────────────────────────────

const DASH = '—'
const REASON_TEXT = {
	empty: 'Enter an amount to see an estimate.',
	invalid: 'Enter a valid amount.',
	'too-small': 'Amount is too small to trade.',
	'no-pool': 'The pool has no liquidity.',
} as const

/**
 * Slippage setting of a ticket: the pressed preset, or the custom field when
 * it holds text. `invalid` when the custom text is malformed or out of range.
 */
export function readSlippage(root: HTMLElement) {
	const custom = root.querySelector<HTMLInputElement>('[data-slippage-custom]')
	const customText = custom?.value.trim() || ''
	const customBps = customText ? percentToBps(customText) : null
	const pressed = root.querySelector<HTMLElement>(
		'[data-slippage-bps][aria-pressed="true"]',
	)
	return {
		bps: customText
			? customBps ?? 0
			: Number(pressed?.dataset.slippageBps || 50),
		invalid: !!customText && customBps === null,
		custom,
	}
}

function refresh(root: HTMLElement) {
	const pool = {
		usdcReserve: root.dataset.usdcReserve || '0',
		tokenReserve: root.dataset.tokenReserve || '0',
		feeBps: Number(root.dataset.feeBps || 30),
	}
	const side: Side = root.querySelector<HTMLInputElement>(
		'input[name="side"]:checked',
	)?.value === 'SELL'
		? 'SELL'
		: 'BUY'
	const buy = side === 'BUY'
	const amountIn = root.querySelector<HTMLInputElement>(
		'input[name="amountIn"]',
	)
	const minOut = root.querySelector<HTMLInputElement>('input[name="minOut"]')
	const submit = root.querySelector<HTMLButtonElement>('[data-ticket-submit]')

	const slip = readSlippage(root)
	const { bps: slippageBps, invalid: slippageInvalid, custom } = slip
	custom?.toggleAttribute('aria-invalid', slippageInvalid)
	if(custom) {
		custom.dataset.active = custom.value.trim() ? 'true' : 'false'
	}

	root.dataset.side = side
	const ticker = root.dataset.ticker || ''
	const inUnit = buy ? 'USDC' : ticker || 'tokens'
	const outUnit = buy ? ticker || 'tokens' : 'USDC'
	const label = root.querySelector<HTMLLabelElement>(
		'label[for="field-amountIn"]',
	)
	if(label?.firstChild) {
		label.firstChild.textContent = `Amount (${inUnit})`
	}

	if(amountIn) {
		amountIn.placeholder = buy ? '100.00' : '50'
		amountIn.inputMode = 'decimal'
		amountIn.autocomplete = 'off'
	}

	if(submit) {
		submit.textContent = `${buy ? 'Buy' : 'Sell'} ${ticker}`.trim()
	}

	const est = estimateSwap({
		side,
		amountIn: amountIn?.value || '',
		pool,
		slippageBps,
	})
	const set = (key: string, text: string) => {
		const el = root.querySelector(`[data-est="${key}"]`)
		if(el) {
			el.textContent = text
		}
	}

	const slipText = `${(slippageBps / 100).toString()}%`
	set('slip', slipText)
	if(est.ok) {
		set('price', `${displayAmount(est.price, 2, 6)} USDC`)
		set('fee', `${displayAmount(est.fee, buy ? 2 : 0, 6)} ${inUnit}`)
		set('impact', `${displayAmount(est.impactPct, 2, 2)}%`)
		set('out', `${displayAmount(est.out, buy ? 0 : 2, 6)} ${outUnit}`)
		set('min', `${displayAmount(est.minOut, buy ? 0 : 2, 6)} ${outUnit}`)
		set('status', '')
	} else {
		for(const key of ['price', 'fee', 'impact', 'out', 'min']) {
			set(key, DASH)
		}

		set('status', REASON_TEXT[est.reason])
	}

	if(slippageInvalid) {
		set('status', 'Slippage must be between 0.01% and 50%.')
	}

	// Only a valid estimate sets a guard; otherwise the route default applies.
	if(minOut) {
		minOut.value = est.ok && !slippageInvalid ? est.minOut : '0'
	}

	if(submit) {
		const halted = root.dataset.halted === 'true'
		submit.disabled = halted || slippageInvalid
	}
}

function rootOf(target: EventTarget | null) {
	return target instanceof Element
		? target.closest<HTMLElement>('[data-order-ticket]')
		: null
}

if(typeof document !== 'undefined') {
	document.addEventListener('input', (ev) => {
		const root = rootOf(ev.target)
		if(!root) {
			return
		}

		// Typing a custom slippage releases the presets.
		if((ev.target as HTMLElement).matches('[data-slippage-custom]')) {
			for(const b of root.querySelectorAll('[data-slippage-bps]')) {
				b.setAttribute('aria-pressed', 'false')
			}
		}

		refresh(root)
	})

	document.addEventListener('change', (ev) => {
		const root = rootOf(ev.target)
		if(root) {
			refresh(root)
		}
	})

	document.addEventListener('click', (ev) => {
		const target = ev.target instanceof Element
			? ev.target.closest<HTMLElement>('[data-slippage-bps]')
			: null
		const root = rootOf(target)
		if(!target || !root) {
			return
		}

		for(const b of root.querySelectorAll('[data-slippage-bps]')) {
			b.setAttribute('aria-pressed', String(b === target))
		}

		const custom = root.querySelector<HTMLInputElement>(
			'[data-slippage-custom]',
		)
		if(custom) {
			custom.value = ''
		}

		refresh(root)
	})

	// `live.ts` resets a form after a successful trade; the reset lands after
	// this event, so recompute on the next task.
	document.addEventListener('reset', (ev) => {
		const root = rootOf(ev.target)
		if(root) {
			setTimeout(() => refresh(root))
		}
	})

	const refreshAll = () => {
		for(const root of document.querySelectorAll<HTMLElement>(
			'[data-order-ticket]',
		)) {
			refresh(root)
		}
	}

	// Back/forward navigation can restore typed values.
	refreshAll()
	document.addEventListener('htmx:load', refreshAll)
}
