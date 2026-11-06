/**
 * Pure helpers for the demo bar's prefill buttons. No DOM globals, so node
 * tests run them on plain objects. `demo.ts` adapts real form elements.
 */

/** The slice of an input, select or textarea that prefill touches. */
export type FieldLike = {
	name: string
	type: string
	value: string
	checked?: boolean
	disabled?: boolean
}

export type PrefillValue = string | number | boolean
export type Prefill = { form: string, values: Record<string, PrefillValue> }

const SKIPPED_TYPES = new Set(['hidden', 'file', 'submit', 'button', 'reset'])

/**
 * Sets each field named in `values`. Radios check the one whose value matches;
 * a checkbox follows a boolean (or matches its own value); everything else
 * takes the string. Skips disabled and non-text types. Returns only the fields
 * that changed, so the caller dispatches events for those.
 */
export function fillFields(
	fields: readonly FieldLike[],
	values: Readonly<Record<string, PrefillValue>>,
) {
	const changed: FieldLike[] = []
	for(const field of fields) {
		if(
			!field.name
			|| field.disabled
			|| SKIPPED_TYPES.has(field.type)
			|| !Object.hasOwn(values, field.name)
		) {
			continue
		}

		const want = values[field.name]
		if(field.type === 'radio') {
			const checked = String(want) === field.value
			if(checked && !field.checked) {
				field.checked = true
				changed.push(field)
			}

			continue
		}

		if(field.type === 'checkbox') {
			const checked = typeof want === 'boolean'
				? want
				: want === 'true' || String(want) === field.value
			if(checked !== !!field.checked) {
				field.checked = checked
				changed.push(field)
			}

			continue
		}

		const text = String(want)
		if(field.value !== text) {
			field.value = text
			changed.push(field)
		}
	}

	return changed
}

/** Parses a `data-demo-prefill` attribute. Returns `null` when malformed. */
export function parsePrefill(raw: string | null | undefined): Prefill | null {
	if(!raw) {
		return null
	}

	let data: unknown
	try {
		data = JSON.parse(raw)
	} catch{
		return null
	}

	if(!data || typeof data !== 'object') {
		return null
	}

	const { form, values } = data as Record<string, unknown>
	if(
		typeof form !== 'string'
		|| !form
		|| !values
		|| typeof values !== 'object'
	) {
		return null
	}

	const clean: Record<string, PrefillValue> = {}
	for(const [key, value] of Object.entries(values)) {
		if(
			typeof value === 'string'
			|| typeof value === 'number'
			|| typeof value === 'boolean'
		) {
			clean[key] = value
		}
	}

	return { form, values: clean }
}

/** Best guess of the step from the path; used when nothing is persisted. */
export function stepForPath(path: string) {
	const p = path.replace(/\/+$/, '').toLowerCase() || '/'
	if(p === '/launch') {
		return 1
	}

	if(p === '/hub') {
		return 2
	}

	if(p === '/portfolio') {
		return 7
	}

	if(p.startsWith('/creators/mush')) {
		return 3
	}

	return null
}

/** Only same-site paths and http(s) URLs may become links or redirects. */
export function safeUrl(url: unknown) {
	if(typeof url !== 'string' || !url) {
		return null
	}

	if(url.startsWith('/') && !url.startsWith('//')) {
		return url
	}

	return /^https?:\/\//i.test(url) ? url : null
}

export const TICKER = 'MUSH'
export const STEP_COUNT = 8

export type DemoOutcome = { value: string, label: string }
export type DemoStep = {
	label: string
	/** Page the step's action runs on. */
	page: string
	/** Where Continue goes after the action. */
	next?: string
	hint?: string
	outcomes?: DemoOutcome[]
	/** Form fill for the step (per outcome); absent when there is no form. */
	prefill?: (outcome: string) => Prefill
}

export const BANK_LATE_PREFILL: Prefill = {
	form: 'form[action="/mock-bank/login"]',
	values: {
		username: 'mushaheed',
		password: 'demo-password',
		scenario: 'late',
	},
}

export const STEPS: readonly DemoStep[] = [
	{
		label: 'Creator: launch $MUSH',
		page: '/launch',
		next: '/hub',
		prefill: () => ({
			form: '#launch-form',
			values: {
				ticker: TICKER,
				displayName: 'Mushaheed Syed',
				headline: 'Software developer building open-source dev tools',
				targetRaise: '10000.00',
				stakeAmount: '500.00',
				sharePct: 5,
				termMonths: 60,
				trancheSchedule: '20-40-40',
				proofCadence: 'MONTHLY',
				social_x: 'https://x.com/_predatorx7',
				social_github: 'https://github.com/predatorx7',
			},
		}),
	},
	{
		label: 'Creator: raise is open',
		page: '/hub',
		next: `/creators/${TICKER}`,
		hint: 'Switch MetaMask to account B',
	},
	{
		label: 'IPO investor: invest',
		page: `/creators/${TICKER}`,
		prefill: () => ({
			form: 'form[action$="/investments"]',
			values: { usdcAmount: '500.00' },
		}),
	},
	{
		label: 'Fill the raise',
		page: '/hub',
		next: '/hub',
		hint: 'Switch MetaMask to account A',
		outcomes: [
			{ value: 'fill', label: 'Fill the raise with demo investors' },
			{ value: 'close', label: 'Close the raise early' },
		],
	},
	{
		label: 'Creator: bank proof and 0G audit',
		page: '/hub',
		outcomes: [
			{
				value: 'salary',
				label: 'Salary $5,000 (approved, tranche released)',
			},
			{
				value: 'low',
				label: 'Low month $800 (approved, tranche locked)',
			},
			{
				value: 'none',
				label: 'No income $0 (approved, no dividend)',
			},
			{ value: 'late', label: 'Late deposit (denied)' },
			{ value: 'miss', label: 'Miss the deadline (freeze)' },
		],
	},
	{
		label: 'Creator: pay the dividend',
		page: '/hub',
		next: '/portfolio',
	},
	{
		label: 'IPO investor: claim',
		page: '/portfolio',
		next: `/creators/${TICKER}`,
	},
	{
		label: 'Trader: trade',
		page: `/creators/${TICKER}`,
		outcomes: [
			{ value: 'buy', label: 'Buy 100 USDC' },
			{ value: 'sell', label: 'Sell 50 $MUSH' },
		],
		prefill: (outcome) => ({
			form: '[data-order-ticket] form',
			values: outcome === 'sell'
				? { side: 'SELL', amountIn: '50' }
				: { side: 'BUY', amountIn: '100.00' },
		}),
	},
]
