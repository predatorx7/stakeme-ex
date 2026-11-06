/// <reference lib="dom" />
import {
	BANK_LATE_PREFILL,
	type FieldLike,
	fillFields,
	type Prefill,
	safeUrl,
	STEP_COUNT,
	stepForPath,
	STEPS,
	TICKER,
} from './demo-fill.ts'

/**
 * Demo bar behavior (only present when the server renders `.demo-bar`):
 * shows the current step, and runs Reset, Prefill, Outcome and Continue. The
 * step index lives in localStorage (path guess as fallback). The bar sits
 * outside the swapped page shell, so it survives htmx navigation. Styles:
 * `demo.css`.
 */

type DemoLink = { label: string, url: string }
type DemoReply = {
	ok?: boolean
	message?: string
	next?: string
	links?: DemoLink[]
}
type Pending = { step: number, to?: string, flash?: string, at: number }

const COLLAPSE_KEY = 'smx-demo-bar-collapsed'
const STEP_KEY = 'smx-demo-step'
const PENDING_KEY = 'smx-demo-pending'
const FLASH_KEY = 'smx-demo-flash'
const PENDING_TTL_MS = 5 * 60_000
const SCENARIO_AMOUNTS: Record<string, string> = {
	salary: '5000.00',
	low: '800.00',
	none: '0.00',
}
const PRESENTER_ONLY = 'Presenter wallet only.'
const bar = document.querySelector<HTMLElement>('[data-demo-bar]')

if(bar) {
	init(bar)
}

function init(root: HTMLElement) {
	const tab = document.querySelector<HTMLElement>('[data-demo-tab]')!
	const status = root.querySelector<HTMLElement>('[data-demo-status]')!
	const label = root.querySelector<HTMLElement>('[data-demo-label]')!
	const more = root.querySelector<HTMLElement>('[data-demo-more]')!
	const prefillBtn = root.querySelector<HTMLButtonElement>(
		'[data-demo-prefill]',
	)!
	const outcomeSel = root.querySelector<HTMLSelectElement>(
		'[data-demo-outcome]',
	)!
	const nextBtn = root.querySelector<HTMLButtonElement>('[data-demo-next]')!
	const presenter = root.dataset.presenter === 'true'
	let step = readStep() ?? stepForPath(location.pathname) ?? 1

	setCollapsed(readStore(COLLAPSE_KEY) === '1')
	render()
	settlePending()
	const flash = readStore(FLASH_KEY)
	if(flash) {
		writeStore(FLASH_KEY, null)
		setStatus(flash)
	}

	tab.addEventListener('click', () => setCollapsed(false))
	root.addEventListener('click', onClick)
	outcomeSel.addEventListener('change', onOutcome)

	function onClick(event: MouseEvent) {
		const target = event.target as Element
		if(target.closest('[data-demo-collapse]')) {
			setCollapsed(true)
		} else if(target.closest('[data-demo-more]')) {
			setPopover(root.dataset.pop !== 'open')
		} else if(target.closest('[data-demo-reset]')) {
			void reset()
		} else if(target.closest('[data-demo-prefill]')) {
			runPrefill()
		} else if(target.closest('[data-demo-next]')) {
			void guarded(nextBtn, runContinue)
		}
	}

	function render() {
		const s = STEPS[step - 1]
		label.textContent = `Step ${step}/${STEP_COUNT}: ${s.label}`
		prefillBtn.disabled = !s.prefill
		const outcomes = s.outcomes ?? []
		outcomeSel.replaceChildren(...outcomes.map((o) => {
			const opt = document.createElement('option')
			opt.value = o.value
			opt.textContent = o.label
			return opt
		}))
		// One outcome (or none) means nothing to choose.
		outcomeSel.hidden = outcomes.length < 2
		showHint()
	}

	function onOutcome() {
		if(step === 4 && outcomeSel.value === 'close') {
			setStatus('Switch to account A and use Close raise on the Hub')
		} else {
			showHint()
		}
	}

	function showHint() {
		setStatus(STEPS[step - 1].hint || '', [], false)
	}

	function setStep(n: number) {
		step = Math.min(Math.max(n, 1), STEP_COUNT)
		writeStore(STEP_KEY, String(step))
		render()
	}

	/** Moves to step `n`, then to `to` when that is another page. */
	function advance(n: number, to?: string, flashText?: string) {
		setStep(n)
		if(flashText) {
			setStatus(flashText)
		}

		if(to && to !== location.pathname) {
			writeStore(FLASH_KEY, flashText || null)
			location.assign(to)
		}
	}

	async function runContinue() {
		const outcome = outcomeSel.hidden ? '' : outcomeSel.value
		switch (step) {
			case 1:
				advance(2, '/hub')
				break
			case 2:
				advance(3, `/creators/${TICKER}`, 'Switch MetaMask to account B')
				break
			case 3:
				advance(4)
				break
			case 4:
				await continueRaise(outcome)
				break
			case 5:
				await continueProof(outcome)
				break
			case 6:
				continueClick(
					'[data-chain-dividend]',
					'No dividend to pay yet. Run step 5 with the salary outcome.',
					7,
					'/portfolio',
					'Switch MetaMask to account B',
				)
				break
			case 7:
				continueClick(
					'[data-chain-claim]',
					'Nothing to claim yet. Pay the dividend first.',
					8,
					`/creators/${TICKER}`,
				)
				break
			default:
				continueTrade()
		}
	}

	async function continueRaise(outcome: string) {
		if(!presenter) {
			setStatus(PRESENTER_ONLY)
			return
		}

		if(outcome === 'close') {
			const btn = document.querySelector<HTMLButtonElement>(
				'form[action$="/close-raise"] button[type="submit"]',
			)
			if(!btn) {
				setStatus('Switch to account A and use Close raise on the Hub')
				if(location.pathname !== '/hub') {
					location.assign('/hub')
				}

				return
			}

			setStatus('Sign the close in MetaMask (account A).')
			clickThenAdvance(btn, 5, '/hub', 'Switch MetaMask to account A')
			return
		}

		const { ok } = await post(`/demo/creators/${TICKER}/fill-raise`, {})
		if(ok) {
			advance(5, '/hub', 'Raise filled. Switch MetaMask to account A')
		}
	}

	async function continueProof(outcome: string) {
		if(outcome === 'late') {
			openBank(BANK_LATE_PREFILL)
			return
		}

		if(outcome === 'miss') {
			if(!presenter) {
				setStatus(PRESENTER_ONLY)
				return
			}

			const { ok, data } = await post(
				`/demo/creators/${TICKER}/advance-deadline`,
				{},
			)
			if(ok) {
				setStatus(
					`${data.message || 'Deadline moved.'} `
						+ 'Escrow freezes on the next sweep.',
					data.links,
				)
			}

			return
		}

		const amount = SCENARIO_AMOUNTS[outcome]
		const btn = onPage('/hub')
			&& document.querySelector<HTMLButtonElement>('[data-reclaim-demo]')
		if(!btn || amount === undefined) {
			return
		}

		const select = btn.closest('[data-reclaim]')
			?.querySelector<HTMLSelectElement>('[data-reclaim-demo-scenario]')
		if(select) {
			select.value = amount
		} else {
			btn.dataset.reclaimDemoAmount = amount
		}

		setStatus('Submitting the proof. The 0G audit runs next.')
		if(outcome === 'salary') {
			clickThenAdvance(btn, 6, '/hub')
		} else {
			btn.click()
		}
	}

	function continueClick(
		selector: string,
		missing: string,
		nextStep: number,
		to: string,
		flashText?: string,
	) {
		const page = STEPS[step - 1].page
		if(!onPage(page)) {
			return
		}

		const btn = document.querySelector<HTMLButtonElement>(selector)
		if(!btn) {
			setStatus(missing)
			return
		}

		setStatus('Sign in MetaMask.')
		clickThenAdvance(btn, nextStep, to, flashText)
	}

	function continueTrade() {
		if(!onPage(`/creators/${TICKER}`)) {
			return
		}

		const btn = document.querySelector<HTMLButtonElement>(
			'[data-order-ticket] form button[type="submit"]',
		)
		if(!btn || btn.disabled) {
			setStatus('The order ticket is not ready. Sign in and prefill it.')
			return
		}

		btn.click()
		setStatus('Sign the order in MetaMask. Demo complete. Reset to run again.')
	}

	/**
	 * Clicks a page button that opens a wallet signature. The page may reload
	 * or swap the button on success, so the next step is stored first and
	 * applied once the button goes away (or on the next load).
	 */
	function clickThenAdvance(
		btn: HTMLButtonElement,
		nextStep: number,
		to?: string,
		flashText?: string,
	) {
		const pending: Pending = {
			step: nextStep,
			to,
			flash: flashText,
			at: Date.now(),
		}
		writeStore(PENDING_KEY, JSON.stringify(pending))
		let sawBusy = false
		const timer = setInterval(() => {
			sawBusy ||= btn.disabled
			if(!btn.isConnected) {
				clearInterval(timer)
				settlePending()
			} else if(
				(sawBusy && !btn.disabled)
				|| Date.now() - pending.at > PENDING_TTL_MS
			) {
				// Back to idle without leaving: signing failed or was rejected.
				clearInterval(timer)
				writeStore(PENDING_KEY, null)
			}
		}, 500)
		btn.click()
	}

	/** Applies a stored step change left by `clickThenAdvance`. */
	function settlePending() {
		const raw = readStore(PENDING_KEY)
		if(!raw) {
			return
		}

		writeStore(PENDING_KEY, null)
		try {
			const p = JSON.parse(raw) as Pending
			if(Date.now() - p.at < PENDING_TTL_MS && p.step > step) {
				advance(p.step, p.to, p.flash)
			}
		} catch{
			// Corrupt entry: ignore.
		}
	}

	function onPage(path: string) {
		if(location.pathname.toLowerCase() === path.toLowerCase()) {
			return true
		}

		writeStore(FLASH_KEY, 'Press Continue to run this step.')
		location.assign(path)
		return false
	}

	async function reset() {
		if(!presenter) {
			setStatus(PRESENTER_ONLY)
			return
		}

		const ask = `Reset the $${TICKER} demo? `
			+ 'This deletes its raise, trades and dividends.'
		if(!confirm(ask)) {
			return
		}

		const { ok } = await post('/demo/reset', { ticker: TICKER })
		if(ok) {
			writeStore(PENDING_KEY, null)
			setStep(1)
			location.assign('/launch')
		}
	}

	function runPrefill() {
		const s = STEPS[step - 1]
		const prefill = s.prefill?.(outcomeSel.value)
		if(!prefill) {
			return
		}

		const form = document.querySelector<HTMLFormElement>(prefill.form)
		if(!form) {
			setStatus(`That form is not on this page. Open ${s.page} first.`)
			return
		}

		const count = fillForm(form, prefill.values)
		setStatus(count ? `Filled ${count} fields.` : 'Already filled.')
	}

	function openBank(prefill: Prefill) {
		const win = window.open('/mock-bank/login', '_blank')
		if(!win) {
			setStatus('The bank tab was blocked. Allow pop-ups and try again.')
			return
		}

		// Same origin, so the bank page can be filled once it loads.
		win.addEventListener('load', () => {
			const form = win.document.querySelector<HTMLFormElement>(prefill.form)
			if(form) {
				fillForm(form, prefill.values)
			}
		})
		setStatus('Bank opened with "Late deposit" selected. Log in there.')
	}

	async function guarded(button: HTMLElement, fn: () => Promise<void>) {
		button.setAttribute('aria-busy', 'true')
		try {
			await fn()
		} finally {
			button.removeAttribute('aria-busy')
		}
	}

	async function post(url: string, body: object) {
		setStatus('Working…', [], false)
		try {
			const res = await fetch(url, {
				method: 'POST',
				credentials: 'same-origin',
				headers: {
					'content-type': 'application/json',
					accept: 'application/json',
				},
				body: JSON.stringify(body),
			})
			const data: DemoReply = await res.json().catch(() => ({}))
			setStatus(
				data.message
					|| (res.ok ? 'Done.' : `Request failed (${res.status}).`),
				data.links,
			)
			if(res.ok) {
				// Hub regions reload on these events.
				for(const name of ['smx:invested', 'smx:raise-closed']) {
					document.body.dispatchEvent(new CustomEvent(name, { bubbles: true }))
				}
			}

			return { ok: res.ok, data }
		} catch{
			setStatus('Could not reach the server. Check your connection.')
			return { ok: false, data: {} as DemoReply }
		}
	}

	function setPopover(open: boolean) {
		root.dataset.pop = open ? 'open' : 'closed'
		more.setAttribute('aria-expanded', String(open))
	}

	function setCollapsed(collapsed: boolean) {
		root.dataset.open = String(!collapsed)
		tab.hidden = !collapsed
		writeStore(COLLAPSE_KEY, collapsed ? '1' : '0')
	}

	function setStatus(text: string, links: DemoLink[] = [], pop = true) {
		status.replaceChildren(text)
		status.title = text
		for(const link of links) {
			const url = safeUrl(link.url)
			if(!url) {
				continue
			}

			const a = document.createElement('a')
			a.href = url
			a.target = '_blank'
			a.rel = 'noopener'
			a.textContent = link.label
			status.append(' ', a)
		}

		if(text && pop) {
			// On small screens the status lives in the popover.
			setPopover(true)
		}
	}
}

function readStep() {
	const n = Number(readStore(STEP_KEY))
	return Number.isInteger(n) && n >= 1 && n <= STEP_COUNT ? n : null
}

function readStore(key: string) {
	try {
		return localStorage.getItem(key)
	} catch{
		return null
	}
}

function writeStore(key: string, value: string | null) {
	try {
		if(value === null) {
			localStorage.removeItem(key)
		} else {
			localStorage.setItem(key, value)
		}
	} catch{
		// Private mode: the choice just doesn't persist.
	}
}

/** Fills a real form and fires the events the page's own scripts listen for. */
function fillForm(form: HTMLFormElement, values: Prefill['values']) {
	const fields = [...form.elements].filter((el): el is
		HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement => (
		el instanceof HTMLInputElement
		|| el instanceof HTMLSelectElement
		|| el instanceof HTMLTextAreaElement
	))
	const changed: FieldLike[] = fillFields(fields, values)
	for(const field of changed) {
		// fillFields returns the same elements it was given.
		const el = field as unknown as HTMLElement
		el.dispatchEvent(new Event('input', { bubbles: true }))
		el.dispatchEvent(new Event('change', { bubbles: true }))
	}

	return changed.length
}
