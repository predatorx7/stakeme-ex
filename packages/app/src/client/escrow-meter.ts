/// <reference lib="dom" />

/**
 * Escrow meter live fill. `EscrowMeter` marks the root `[data-escrow-meter]`
 * (with `data-ticker`) and each segment `.smx-escrow-meter__seg` with
 * `data-idx` and `data-state`. Two paths fill a segment with
 * `is-filling`
 * (scaleX from the left, see `escrow-meter.css`):
 *
 *   1. A `TRANCHE_RELEASED` SSE message (the same `oracle-event` stream
 *      `live.ts` reads; no second EventSource) fills the matching segment in
 *      place, before the market region reloads.
 *   2. After an htmx swap, segments that were not released before and are now
 *      do the same (covers a reload that arrives without the SSE hook).
 *
 * Both are idempotent: a segment that is already released is left alone.
 */

const FILL_MS = 600
const SEG = '.smx-escrow-meter__seg'
const METER = '[data-escrow-meter]'
const RELEASED = `${SEG}[data-state=released]`

const before = new Map<string, Set<string>>()

function released(root: ParentNode) {
	const out = new Map<string, Set<string>>()
	for(const meter of root.querySelectorAll<HTMLElement>(METER)) {
		const set = new Set<string>()
		for(const seg of meter.querySelectorAll<HTMLElement>(RELEASED)) {
			set.add(seg.dataset.idx ?? '')
		}

		out.set(meter.dataset.ticker ?? '', set)
	}

	return out
}

function fill(seg: HTMLElement) {
	seg.dataset.state = 'released'
	seg.classList.remove('is-filling')
	// Restart the animation if it is already running.
	void seg.offsetWidth
	seg.classList.add('is-filling')
	window.setTimeout(() => seg.classList.remove('is-filling'), FILL_MS + 50)
	// The next locked segment becomes the hatched one.
	const meter = seg.closest<HTMLElement>(METER)
	if(meter && !meter.hasAttribute('data-frozen')) {
		const nextSeg = meter.querySelector<HTMLElement>(
			`${SEG}[data-state=locked]`,
		)
		if(nextSeg) {
			nextSeg.dataset.state = 'next'
		}
	}
}

function meters(ticker: string) {
	return [...document.querySelectorAll<HTMLElement>(METER)]
		.filter((m) => m.dataset.ticker === ticker)
}

document.addEventListener('htmx:sseMessage', (event) => {
	const message = (event as CustomEvent).detail as MessageEvent | undefined
	if(message?.type !== 'oracle-event') {
		return
	}

	const item = (event.target as Element | null)?.firstElementChild
	if(item?.getAttribute('data-kind') !== 'TRANCHE_RELEASED') {
		return
	}

	const text = item.textContent ?? ''
	const ticker = /\$([A-Za-z0-9_-]+)/.exec(text)?.[1]
	const idx = /tranche (\d+)/i.exec(text)?.[1]
	if(!ticker || idx === undefined) {
		return
	}

	for(const meter of meters(ticker)) {
		const seg = meter.querySelector<HTMLElement>(
			`${SEG}[data-idx="${CSS.escape(idx)}"]`,
		)
		if(seg && seg.dataset.state !== 'released') {
			fill(seg)
		}
	}
})

document.addEventListener('htmx:beforeSwap', (event) => {
	const detail = (event as CustomEvent<{ target?: Element }>).detail
	if(!detail.target) {
		return
	}

	for(const [ticker, set] of released(detail.target)) {
		before.set(ticker, set)
	}
})

document.addEventListener('htmx:afterSettle', () => {
	if(!before.size) {
		return
	}

	for(const meter of document.querySelectorAll<HTMLElement>(METER)) {
		const prev = before.get(meter.dataset.ticker ?? '')
		if(!prev) {
			continue
		}

		for(const seg of meter.querySelectorAll<HTMLElement>(RELEASED)) {
			if(!prev.has(seg.dataset.idx ?? '')) {
				seg.classList.add('is-filling')
				window.setTimeout(
					() => seg.classList.remove('is-filling'),
					FILL_MS + 50,
				)
			}
		}
	}

	before.clear()
})
