/// <reference lib="dom" />

/**
 * Dividend coin trail. On a `DIVIDEND_PAID` SSE message for the ticker on the
 * page, gold dots travel from `[data-coin-source]` to `[data-coin-target]`,
 * the target pulses and a short inline note appears beside it. Reuses the SSE
 * stream live.ts already listens to (htmx `sse:` events); no second source.
 * Rects are read at fire time. Does nothing if either anchor is missing.
 * Styling lives in `coin-trail.css`.
 */

const DOTS = 6
const STAGGER_MS = 60
const FLIGHT_MS = 700
const NOTE_MS = 3000
const PULSE_MS = 1200

const seen = new Set<string>()
const pulseTimers = new WeakMap<HTMLElement, number>()

document.addEventListener('htmx:sseMessage', (event) => {
	const message = (event as CustomEvent).detail as MessageEvent
	if(message.type !== 'oracle-event') {
		return
	}

	const row = (event.target as Element | null)?.firstElementChild
	if(row?.getAttribute('data-kind') !== 'DIVIDEND_PAID') {
		return
	}

	const ticker = row.querySelector('a')?.textContent?.replace('$', '').trim()
	const pageTicker = /^\/creators\/([^/]+)/.exec(location.pathname)?.[1]
	if(!ticker || ticker.toLowerCase() !== pageTicker?.toLowerCase()) {
		return
	}

	const id = row.getAttribute('data-event-id')
	if(id) {
		if(seen.has(id)) {
			return
		}

		seen.add(id)
	}

	// The row reads `$TICKER · dividend paid · $250`; amount is the last span.
	const amount = row.querySelector('span:not(.rc-badge)')?.textContent?.trim()
	fire(amount)
})

function fire(amount?: string) {
	const source = document.querySelector<HTMLElement>('[data-coin-source]')
	const target = document.querySelector<HTMLElement>('[data-coin-target]')
	if(!source || !target) {
		return
	}

	const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
	if(!reduced) {
		trail(source.getBoundingClientRect(), target.getBoundingClientRect())
	}

	const delay = reduced ? 0 : FLIGHT_MS + (DOTS - 1) * STAGGER_MS
	setTimeout(() => {
		// Re-query: an htmx swap may have replaced the target meanwhile.
		const live = document.querySelector<HTMLElement>('[data-coin-target]')
		if(live) {
			pulse(live)
			note(live, amount)
		}
	}, delay)
}

function trail(from: DOMRect, to: DOMRect) {
	const x0 = from.left + from.width / 2
	const y0 = from.top + from.height / 2
	const x1 = to.left + to.width / 2
	const y1 = to.top + to.height / 2
	// Control offset perpendicular to the path gives a slight arc.
	const lift = Math.min(60, Math.hypot(x1 - x0, y1 - y0) / 4)
	for(let i = 0; i < DOTS; i++) {
		const dot = document.createElement('span')
		dot.className = 'smx-coin'
		dot.setAttribute('aria-hidden', 'true')
		document.body.append(dot)
		const mid = (i - (DOTS - 1) / 2) * 4
		const frame = (t: number, o: number) => {
			const arc = Math.sin(t * Math.PI) * (lift + mid)
			return {
				transform: `translate(${x0 + (x1 - x0) * t - 3}px, `
					+ `${y0 + (y1 - y0) * t - arc - 3}px)`,
				opacity: o,
			}
		}

		const animation = dot.animate([
			frame(0, 0),
			{ ...frame(0.1, 1), offset: 0.1 },
			{ ...frame(0.5, 1), offset: 0.5 },
			{ ...frame(0.85, 1), offset: 0.85 },
			frame(1, 0),
		], {
			duration: FLIGHT_MS,
			delay: i * STAGGER_MS,
			easing: 'ease-in-out',
			fill: 'both',
		})
		animation.onfinish = () => dot.remove()
		animation.oncancel = () => dot.remove()
	}
}

function pulse(el: HTMLElement) {
	const timer = pulseTimers.get(el)
	if(timer !== undefined) {
		clearTimeout(timer)
	}

	el.classList.remove('is-coin-pulse')
	// Force a reflow so a repeat pulse restarts the animation.
	void el.offsetWidth
	el.classList.add('is-coin-pulse')
	pulseTimers.set(el, window.setTimeout(() => {
		el.classList.remove('is-coin-pulse')
		pulseTimers.delete(el)
	}, PULSE_MS))
}

function note(target: HTMLElement, amount?: string) {
	document.querySelector('.smx-coin-note')?.remove()
	const holders = target.dataset.holders
		|| /\d[\d,]*/.exec(target.textContent ?? '')?.[0]
	const text = `+${amount || 'Dividend'} dividend paid`
		+ (holders ? ` to ${holders} holders` : '')
	const el = document.createElement('span')
	el.className = 'smx-coin-note'
	el.setAttribute('role', 'status')
	el.textContent = text
	document.body.append(el)
	const rect = target.getBoundingClientRect()
	el.style.top = `${rect.top + rect.height / 2}px`
	const left = Math.min(rect.right + 8, innerWidth - el.offsetWidth - 8)
	el.style.left = `${left}px`
	setTimeout(() => el.remove(), NOTE_MS)
}
