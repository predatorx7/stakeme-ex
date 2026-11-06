/// <reference lib="dom" />

/**
 * Odometer-style number roll. `rollTo` rewrites an element's text; digits
 * that changed roll up (price rose) or down (fell) over ROLL_MS, everything
 * else swaps instantly. The visual is aria-hidden with the real text in a
 * visually hidden span; once the roll ends the element holds plain text.
 * Styling lives in `number-roll.css`.
 */

export type RollDirection = 'up' | 'down'

export type RollChar = {
	char: string
	/** True when this is a digit whose value differs from the old text. */
	roll: boolean
	/** Old digit, when `roll` is true. */
	from: number
}

const ROLL_MS = 400
const DIGIT = /^[0-9]$/

const running = new WeakMap<HTMLElement, () => void>()

/**
 * Pure diff. Texts are right-aligned so decimal places and units line up
 * even when the length changes. Only digits can roll; a digit with no old
 * counterpart (or a non-digit one) swaps instantly.
 */
export function diffChars(oldText: string, newText: string): RollChar[] {
	const offset = newText.length - oldText.length
	return Array.from(newText, (char, i) => {
		const old = oldText[i - offset]
		const roll = DIGIT.test(char) && old !== undefined
			&& DIGIT.test(old) && old !== char
		return { char, roll, from: roll ? Number(old) : 0 }
	})
}

/**
 * Column cell indices (0-19, two stacked 0-9 runs) to travel between.
 * Up always moves toward higher indices, down toward lower, so a carry
 * (9 to 0 on a rise) still rolls in the direction of the price.
 */
export function rollSpan(from: number, to: number, direction: RollDirection) {
	if(direction === 'up') {
		return { start: from, end: to > from ? to : to + 10 }
	}

	return { start: from + 10, end: to < from ? to + 10 : to }
}

export function rollTo(
	el: HTMLElement,
	newText: string,
	direction: RollDirection,
	oldText = el.textContent ?? '',
) {
	running.get(el)?.()

	const parts = diffChars(oldText, newText)
	const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
	if(reduced || !parts.some(p => p.roll) || !el.animate) {
		el.textContent = newText
		return
	}

	const visual = document.createElement('span')
	visual.className = 'nr-visual'
	visual.setAttribute('aria-hidden', 'true')
	const columns: { col: HTMLElement, start: number, end: number }[] = []
	for(const p of parts) {
		if(!p.roll) {
			visual.append(p.char)
			continue
		}

		const col = document.createElement('span')
		col.className = 'nr-col'
		for(let i = 0; i < 20; i++) {
			const cell = document.createElement('span')
			cell.textContent = String(i % 10)
			col.append(cell)
		}

		const { start, end } = rollSpan(p.from, Number(p.char), direction)
		col.style.transform = `translateY(calc(var(--nr-h) * -${end}))`
		const wrap = document.createElement('span')
		wrap.className = 'nr-digit'
		wrap.append(col)
		visual.append(wrap)
		columns.push({ col, start, end })
	}

	const label = document.createElement('span')
	label.className = 'nr-sr'
	label.textContent = newText
	el.replaceChildren(visual, label)

	const animations = columns.map(({ col, start, end }) => col.animate(
		[
			{ transform: `translateY(calc(var(--nr-h) * -${start}))` },
			{ transform: `translateY(calc(var(--nr-h) * -${end}))` },
		],
		{ duration: ROLL_MS, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' },
	))

	let done = false
	const finish = () => {
		if(done) {
			return
		}

		done = true
		running.delete(el)
		for(const a of animations) {
			a.cancel()
		}

		el.textContent = newText
	}

	running.set(el, finish)
	Promise.all(animations.map(a => a.finished)).then(finish, () => {})
}
