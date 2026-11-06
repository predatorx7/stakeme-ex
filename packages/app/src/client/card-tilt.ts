/// <reference lib="dom" />

/**
 * Hover tilt for cards marked `data-tilt`. A rAF-throttled `pointermove`
 * (delegated on `document`, so htmx swaps need no re-binding) sets `--mx`,
 * `--my` (pointer position in px), `--rx` and `--ry` (degrees, max MAX_DEG).
 * CSS in `card-tilt.css` turns them into the tilt and the gold edge sweep.
 * Touch and reduced-motion users get no tilt.
 */

const MAX_DEG = 2.5
const SELECTOR = '[data-tilt]'

const motionOk = matchMedia(
	'(hover: hover) and (prefers-reduced-motion: no-preference)',
)

let active: HTMLElement | undefined
let frame = 0
let last: PointerEvent | undefined

document.addEventListener('pointermove', ev => {
	if(!motionOk.matches || ev.pointerType !== 'mouse') {
		return
	}

	const card = (ev.target as Element | null)?.closest<HTMLElement>(SELECTOR)
	if(card !== active) {
		reset()
		active = card ?? undefined
	}

	if(!card) {
		return
	}

	last = ev
	frame ||= requestAnimationFrame(paint)
}, { passive: true })

document.addEventListener('pointerleave', reset, true)
document.addEventListener('htmx:beforeSwap', reset)

function paint() {
	frame = 0
	if(!active || !last) {
		return
	}

	const r = active.getBoundingClientRect()
	if(!r.width || !r.height) {
		return
	}

	const x = last.clientX - r.left
	const y = last.clientY - r.top
	const s = active.style
	s.setProperty('--mx', `${x.toFixed(1)}px`)
	s.setProperty('--my', `${y.toFixed(1)}px`)
	s.setProperty('--ry', `${((x / r.width - 0.5) * 2 * MAX_DEG).toFixed(2)}deg`)
	s.setProperty('--rx', `${((0.5 - y / r.height) * 2 * MAX_DEG).toFixed(2)}deg`)
	active.dataset.tiltOn = ''
}

function reset(ev?: Event) {
	if(ev && ev.target !== active) {
		return
	}

	cancelAnimationFrame(frame)
	frame = 0
	last = undefined
	if(active) {
		active.removeAttribute('data-tilt-on')
		for(const p of ['--mx', '--my', '--rx', '--ry']) {
			active.style.removeProperty(p)
		}
	}

	active = undefined
}
