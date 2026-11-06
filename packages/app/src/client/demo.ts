/// <reference lib="dom" />
import {
	type FieldLike,
	fillFields,
	parsePrefill,
	type Prefill,
	safeUrl,
	stepForPath,
} from './demo-fill.ts'

/**
 * Demo bar behavior (only present when the server renders `.demo-bar`):
 * picks the current step from the path, runs prefill buttons, calls the demo
 * helper routes, and collapses the bar. The bar sits outside the swapped page
 * shell, so it survives htmx navigation. Styles: `demo.css`.
 */

type DemoLink = { label: string, url: string }
type DemoReply = {
	ok?: boolean
	message?: string
	next?: string
	links?: DemoLink[]
}

const STORE_KEY = 'smx-demo-bar-collapsed'
const STEP_COUNT = 5
const bar = document.querySelector<HTMLElement>('[data-demo-bar]')

if(bar) {
	init(bar)
}

function init(root: HTMLElement) {
	const tab = document.querySelector<HTMLElement>('[data-demo-tab]')!
	const status = root.querySelector<HTMLElement>('[data-demo-status]')!
	const next = root.querySelector<HTMLAnchorElement>('[data-demo-next]')!
	const more = root.querySelector<HTMLElement>('[data-demo-more]')!
	const chips = [...root.querySelectorAll<HTMLElement>('[data-demo-step]')]
	let step = 1

	setCollapsed(readCollapsed())
	syncPath()

	document.addEventListener('htmx:pushedIntoHistory', syncPath)
	document.addEventListener('htmx:historyRestore', syncPath)
	window.addEventListener('popstate', syncPath)
	tab.addEventListener('click', () => setCollapsed(false))
	root.addEventListener('click', onClick)

	function onClick(event: MouseEvent) {
		const target = event.target as Element
		const chip = target.closest<HTMLElement>('[data-demo-step]')
		if(chip) {
			select(Number(chip.dataset.demoStep))
			return
		}

		if(target.closest('[data-demo-collapse]')) {
			setCollapsed(true)
			return
		}

		if(target.closest('[data-demo-more]')) {
			setPopover(root.dataset.pop !== 'open')
			return
		}

		if(target.closest('[data-demo-next]')) {
			const to = Math.min(step + 1, STEP_COUNT)
			const href = chips[to - 1].dataset.href!
			// Same page (Raise to Dividend): just move the highlight.
			if(href === location.pathname || to === step) {
				event.preventDefault()
			}

			select(to)
			return
		}

		const prefill = target.closest<HTMLElement>('[data-demo-prefill]')
		if(prefill) {
			runPrefill(prefill.dataset.demoPrefill)
			return
		}

		const bank = target.closest<HTMLElement>('[data-demo-bank]')
		if(bank) {
			openBank(bank.dataset.demoBank)
			return
		}

		const post = target.closest<HTMLElement>('[data-demo-post]')
		if(post) {
			void call(post, post.dataset.demoPost!, {})
			return
		}

		const reset = target.closest<HTMLElement>('[data-demo-reset]')
		if(reset) {
			const ticker = reset.dataset.demoReset!
			const ask = `Reset the $${ticker} demo? `
				+ 'This deletes its raise, trades and dividends.'
			if(confirm(ask)) {
				void call(reset, '/demo/reset', { ticker })
			}
		}
	}

	function select(n: number) {
		step = n
		root.dataset.step = String(n)
		for(const chip of chips) {
			const on = Number(chip.dataset.demoStep) === n
			chip.dataset.current = String(on)
			chip.setAttribute('aria-current', on ? 'step' : 'false')
		}

		const to = Math.min(n + 1, STEP_COUNT)
		next.href = chips[to - 1].dataset.href!
		next.hidden = n >= STEP_COUNT
		setStatus('')
	}

	function syncPath() {
		const n = stepForPath(location.pathname)
		// Keep a manual pick (Dividend) while the page stays the same.
		if(n && !(n === 2 && step === 3)) {
			select(n)
		}

		setPopover(false)
	}

	function setPopover(open: boolean) {
		root.dataset.pop = open ? 'open' : 'closed'
		more.setAttribute('aria-expanded', String(open))
	}

	function setCollapsed(collapsed: boolean) {
		root.dataset.open = String(!collapsed)
		tab.hidden = !collapsed
		try {
			localStorage.setItem(STORE_KEY, collapsed ? '1' : '0')
		} catch{
			// Private mode: the choice just doesn't persist.
		}
	}

	function setStatus(text: string, links: DemoLink[] = []) {
		status.replaceChildren(text)
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

		if(text) {
			// On small screens the status lives in the popover.
			setPopover(true)
		}
	}

	function runPrefill(raw: string | undefined) {
		const prefill = parsePrefill(raw)
		if(!prefill) {
			setStatus('This prefill is broken. Check the button config.')
			return
		}

		const form = document.querySelector<HTMLFormElement>(prefill.form)
		if(!form) {
			setStatus('That form is not on this page. Open its step first.')
			return
		}

		const count = fillForm(form, prefill.values)
		setStatus(count ? `Filled ${count} fields.` : 'Already filled.')
	}

	function openBank(raw: string | undefined) {
		const prefill = parsePrefill(raw)
		const win = window.open('/mock-bank/login', '_blank')
		if(!win || !prefill) {
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
		setStatus('Bank opened in a new tab with "Salary on time" selected.')
	}

	async function call(button: HTMLElement, url: string, body: object) {
		button.setAttribute('aria-busy', 'true')
		setStatus('Working…')
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
			const message = data.message
				|| (res.ok ? 'Done.' : `Request failed (${res.status}).`)
			setStatus(message, data.links)
			if(res.ok) {
				// Hub regions reload on these events.
				for(const name of ['smx:invested', 'smx:raise-closed']) {
					document.body.dispatchEvent(new CustomEvent(name, { bubbles: true }))
				}

				const to = safeUrl(data.next)
				if(to) {
					location.assign(to)
				} else if(url === '/demo/reset') {
					location.assign('/launch')
				}
			}
		} catch{
			setStatus('Could not reach the server. Check your connection.')
		} finally {
			button.removeAttribute('aria-busy')
		}
	}
}

/** Fills a real form and fires the events the page's own scripts listen for. */
function readCollapsed() {
	try {
		return localStorage.getItem(STORE_KEY) === '1'
	} catch{
		return false
	}
}

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
