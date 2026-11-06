/// <reference lib="dom" />

/**
 * Live price flash. Elements marked `data-price-flash` carry their decimal
 * price in `data-price`. Before an htmx swap the current values are
 * remembered by a stable key (`data-price-key`, else `data-ticker` plus the
 * element id); once the swap has settled, any element whose price moved gets
 * `is-flash-up` or `is-flash-down` for FLASH_MS. The styling lives in
 * `instrument-flash.css`. Listeners are delegated on `document`.
 */

import { rollTo } from './number-roll.ts'

const FLASH_MS = 600
const SELECTOR = '[data-price-flash]'

const previous = new Map<string, string>()
const previousText = new Map<string, string>()
const timers = new WeakMap<HTMLElement, number>()

function keyOf(el: HTMLElement) {
	const explicit = el.dataset.priceKey
	if(explicit) {
		return explicit
	}

	const id = el.id
	if(!id) {
		return ''
	}

	const ticker = el.dataset.ticker
		?? el.closest<HTMLElement>('[data-ticker]')?.dataset.ticker
		?? ''
	return `${ticker}:${id}`
}

function* flashing(root: ParentNode | null) {
	if(!root) {
		return
	}

	if(root instanceof HTMLElement && root.matches(SELECTOR)) {
		yield root
	}

	yield* root.querySelectorAll<HTMLElement>(SELECTOR)
}

// Exact decimal comparison on strings, so large or long prices don't lose
// precision. Returns -1, 0 or 1, or null if either value is not a decimal.
function compare(a: string, b: string) {
	const pa = parse(a)
	const pb = parse(b)
	if(!pa || !pb) {
		return null
	}

	const scale = Math.max(pa.frac.length, pb.frac.length)
	const x = pa.sign * BigInt(pa.int + pa.frac.padEnd(scale, '0'))
	const y = pb.sign * BigInt(pb.int + pb.frac.padEnd(scale, '0'))
	return x === y ? 0 : x < y ? -1 : 1
}

function parse(value: string) {
	const m = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(value.trim())
	if(!m || !(m[2] || m[3])) {
		return null
	}

	return {
		sign: m[1] === '-' ? -1n : 1n,
		int: m[2] || '0',
		frac: m[3] ?? '',
	}
}

function flash(el: HTMLElement, direction: 'up' | 'down') {
	const timer = timers.get(el)
	if(timer !== undefined) {
		clearTimeout(timer)
	}

	el.classList.remove('is-flash-up', 'is-flash-down')
	// Force a reflow so a repeat flash restarts the animation.
	void el.offsetWidth
	el.classList.add(`is-flash-${direction}`)
	timers.set(el, window.setTimeout(() => {
		el.classList.remove('is-flash-up', 'is-flash-down')
		timers.delete(el)
	}, FLASH_MS))
}

document.addEventListener('htmx:beforeSwap', (event) => {
	const detail = (event as CustomEvent<{
		shouldSwap?: boolean
		target?: Element
	}>).detail
	if(detail.shouldSwap === false) {
		return
	}

	for(const el of flashing(detail.target ?? null)) {
		const key = keyOf(el)
		if(key && el.dataset.price) {
			previous.set(key, el.dataset.price)
			previousText.set(key, el.textContent ?? '')
		}
	}
})

document.addEventListener('htmx:afterSettle', () => {
	if(!previous.size) {
		return
	}

	for(const el of flashing(document)) {
		const key = keyOf(el)
		const before = previous.get(key)
		const now = el.dataset.price
		if(before === undefined || now === undefined) {
			continue
		}

		const order = compare(now, before)
		if(order) {
			const direction = order > 0 ? 'up' : 'down'
			rollTo(el, el.textContent ?? '', direction, previousText.get(key))
			flash(el, direction)
		}
	}

	previous.clear()
	previousText.clear()
})
