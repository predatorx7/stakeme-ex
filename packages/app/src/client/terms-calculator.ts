/// <reference lib="dom" />
import { suggestTerms, type TermsSuggestion } from '../utils/terms-suggest.ts'

/**
 * Drives `[data-terms-calc]` (see `TermsCalculator.tsx`). Suggests values live
 * and, on "Use these terms", fills the launch form without locking any
 * field. The math is `utils/terms-suggest.ts`; this file only does DOM.
 */

type Row = [string, (s: TermsSuggestion) => string, ReasonKey]
type ReasonKey = keyof TermsSuggestion['reasons']
const ROWS: Row[] = [
	['Income share', s => `${s.sharePct}%`, 'shareBps'],
	['First monthly dividend', s => `$${s.monthlyDividend}`, 'monthlyDividend'],
	['Your stake', s => `$${s.stake}`, 'stake'],
	['Escrow release', s => s.trancheSchedule === 'single'
		? 'No tranches'
		: s.trancheSchedule.replaceAll('-', ' / '), 'trancheSchedule'],
	['Income proof', s => s.proofCadence === 'MONTHLY'
		? 'Monthly'
		: 'Quarterly', 'proofCadence'],
]

const latest = new WeakMap<Element, { goal: string, s: TermsSuggestion }>()

function num(root: Element, name: string) {
	const el = root.querySelector<HTMLInputElement>(`[name="${name}"]`)
	return el?.value.trim() ? Number(el.value) : undefined
}

function update(root: HTMLElement) {
	const income = num(root, 'calc-income')
	const goal = num(root, 'calc-goal')
	const s = income !== undefined && goal !== undefined
		? suggestTerms({
			monthlyIncome: income,
			goalAmount: goal,
			termMonths: num(root, 'calc-term') ?? Number.NaN,
			annualGrowthPct: num(root, 'calc-growth') ?? 0,
			savings: num(root, 'calc-savings'),
			incomeVaries: root.querySelector<HTMLInputElement>(
				'[data-calc-varies]',
			)?.checked,
			minIncome: Number(root.dataset.minIncome) || undefined,
		})
		: null
	const result = root.querySelector<HTMLElement>('[data-calc-result]')!
	const empty = root.querySelector<HTMLElement>('[data-calc-empty]')!
	result.hidden = !s
	empty.hidden = !!s
	if(!s) {
		latest.delete(root)
		return
	}

	latest.set(root, { goal: String(goal), s })
	const list = root.querySelector('[data-calc-list]')!
	list.replaceChildren(...ROWS.flatMap(([label, format, key]) => {
		const dt = document.createElement('dt')
		dt.textContent = label
		const dd = document.createElement('dd')
		const strong = document.createElement('strong')
		strong.textContent = format(s)
		const why = document.createElement('small')
		why.textContent = s.reasons[key]
		dd.append(strong, why)
		return [dt, dd]
	}))
	const warnings = root.querySelector('[data-calc-warnings]')!
	warnings.replaceChildren(...s.warnings.map(w => {
		const li = document.createElement('li')
		const pill = document.createElement('span')
		pill.className = 'rc-pill'
		pill.dataset.tone = 'pending'
		pill.textContent = 'Heads up'
		li.append(pill, ` ${w.message}`)
		return li
	}))
}

function setField(form: HTMLFormElement, name: string, value: string) {
	const el = form.elements.namedItem(name)
	if(el instanceof HTMLInputElement) {
		el.value = value
		el.dispatchEvent(new Event('input', { bubbles: true }))
		el.dispatchEvent(new Event('change', { bubbles: true }))
	}
}

function setRadio(form: HTMLFormElement, name: string, value: string) {
	const radios = form.querySelectorAll<HTMLInputElement>(
		`input[type="radio"][name="${name}"]`,
	)
	for(const r of radios) {
		if(r.value === value) {
			r.checked = true
			r.dispatchEvent(new Event('change', { bubbles: true }))
		}
	}
}

document.addEventListener('input', (event) => {
	const root = (event.target as Element | null)?.closest<HTMLElement>(
		'[data-terms-calc]',
	)
	if(root) {
		update(root)
	}
})

document.addEventListener('click', (event) => {
	const btn = (event.target as Element | null)?.closest('[data-calc-apply]')
	const root = btn?.closest<HTMLElement>('[data-terms-calc]')
	const form = document.querySelector<HTMLFormElement>('#launch-form')
	const got = root && latest.get(root)
	if(!got || !form) {
		return
	}

	const { goal, s } = got
	setField(form, 'targetRaise', goal)
	setField(form, 'stakeAmount', s.stake)
	setField(form, 'sharePct', s.sharePct)
	setField(form, 'termMonths', String(num(root, 'calc-term')))
	setRadio(form, 'trancheSchedule', s.trancheSchedule)
	setRadio(form, 'proofCadence', s.proofCadence)
	form.scrollIntoView({ behavior: 'smooth', block: 'start' })
})
