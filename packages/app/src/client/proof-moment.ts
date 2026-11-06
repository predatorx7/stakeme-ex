/// <reference lib="dom" />

/**
 * Proof-approved moment. `ProofPipeline` roots (`[data-proof-pipeline]`) light
 * up in sequence when the `/events` stream (already open for the page; this
 * module adds no connection) delivers an oracle event for their ticker:
 *
 *   PROOF_VERIFIED   steps 1 and 2 done, 250 ms apart, step 3 active
 *   TRANCHE_RELEASED step 3 done, amount counts up over 800 ms
 *   PROOF_REJECTED   step 2 denied with the reason
 *
 * The rendered row has no payload attributes, so the amount and reason come
 * from its text (see `describeEvent`). Roots are looked up when a timer fires,
 * so a swap of the region mid-sequence still lands on the new DOM. Reduced
 * motion applies the final state and number at once.
 */

const STEP_MS = 250
const COUNT_MS = 800

type State = 'idle' | 'active' | 'done' | 'denied'

const busyUntil = new Map<string, number>()
const seen = new Set<string>()
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches

document.addEventListener('htmx:sseMessage', (event) => {
	const message = (event as CustomEvent).detail as MessageEvent
	if(message.type !== 'oracle-event') {
		return
	}

	const row = (event.target as Element | null)?.firstElementChild
	const kind = row?.getAttribute('data-kind') ?? ''
	const ticker = row?.querySelector('a')?.getAttribute('href')
		?.split('/').pop() ?? ''
	const id = row?.getAttribute('data-event-id') ?? ''
	if(!row || !ticker || seen.has(id)) {
		return
	}

	if(id) {
		seen.add(id)
	}

	const detail = row.querySelector('span')?.textContent ?? ''
	if(kind === 'PROOF_VERIFIED') {
		reset(ticker)
		queue(ticker, () => setStep(ticker, 1, 'done'))
		queue(ticker, () => setStep(ticker, 2, 'done'))
		queue(ticker, () => setStep(ticker, 3, 'active'))
	} else if(kind === 'PROOF_REJECTED') {
		reset(ticker)
		queue(ticker, () => setStep(ticker, 1, 'done'))
		queue(ticker, () => setStep(ticker, 2, 'denied', detail))
	} else if(kind === 'TRANCHE_RELEASED') {
		const amount = parseAmount(detail.split('·').pop() ?? '')
		queue(ticker, () => setStep(ticker, 1, 'done'))
		queue(ticker, () => setStep(ticker, 2, 'done'))
		queue(ticker, () => {
			setStep(ticker, 3, 'done')
			release(ticker, amount)
		})
	}
})

function roots(ticker: string) {
	return document.querySelectorAll<HTMLElement>(
		`[data-proof-pipeline][data-ticker="${CSS.escape(ticker)}"]`,
	)
}

// Run `fn` one step after the previous queued step for this ticker.
function queue(ticker: string, fn: () => void) {
	if(reduced()) {
		fn()
		return
	}

	const now = Date.now()
	const at = Math.max(now, busyUntil.get(ticker) ?? 0)
	busyUntil.set(ticker, at + STEP_MS)
	setTimeout(fn, at - now)
}

function reset(ticker: string) {
	busyUntil.delete(ticker)
	for(const root of roots(ticker)) {
		for(const step of root.querySelectorAll<HTMLElement>('[data-step]')) {
			step.dataset.state = 'idle'
		}
	}
}

function setStep(ticker: string, n: number, state: State, reason = '') {
	for(const root of roots(ticker)) {
		const step = root.querySelector<HTMLElement>(`[data-step="${n}"]`)
		if(!step) {
			continue
		}

		step.dataset.state = state
		const slot = step.querySelector('[data-pp-reason]')
		if(slot) {
			slot.textContent = state === 'denied' ? reason : ''
		}
	}
}

function release(ticker: string, parsed: number) {
	for(const root of roots(ticker)) {
		const out = root.querySelector<HTMLElement>('[data-pp-amount]')
		const sr = root.querySelector<HTMLElement>('[data-pp-sr]')
		const label = root.querySelector<HTMLElement>('[data-pp-label]')
		const value = parsed || Number(root.dataset.amount)
		if(label) {
			label.textContent = 'Released'
		}

		if(!out || !(value > 0)) {
			continue
		}

		const text = format(value)
		if(sr) {
			sr.textContent = text
		}

		if(reduced()) {
			out.textContent = text
			continue
		}

		countUp(out, value)
	}
}

function countUp(out: HTMLElement, value: number) {
	const start = performance.now()
	out.textContent = format(0)
	requestAnimationFrame(frame)

	function frame(now: number) {
		if(!out.isConnected) {
			return
		}

		const t = Math.min(1, (now - start) / COUNT_MS)
		const eased = 1 - (1 - t) ** 3
		out.textContent = format(value * eased)
		if(t < 1) {
			requestAnimationFrame(frame)
		}
	}
}

function parseAmount(text: string) {
	return Number(text.replace(/[^0-9.]/g, '')) || 0
}

function format(n: number) {
	return n.toLocaleString('en-US', {
		style: 'currency',
		currency: 'USD',
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	})
}
