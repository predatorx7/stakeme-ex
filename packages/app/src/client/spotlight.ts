/// <reference lib="dom" />

/**
 * Lattice spotlight. Pointer movement over a `.rc-page-header` sets `--sx` and
 * `--sy` (px, relative to the header) and toggles `is-spotlit`; the styling
 * lives in `spotlight.css`. rAF-throttled, delegated on `document`, so htmx
 * swaps need no re-binding. No-op on touch and under reduced motion.
 */

const HEADER = '.rc-page-header'
const enabled = window.matchMedia(
	'(hover: hover) and (pointer: fine)'
	+ ' and (prefers-reduced-motion: no-preference)',
)

let active: HTMLElement | undefined
let frame = 0
let x = 0
let y = 0

document.addEventListener('pointermove', ev => {
	if(!enabled.matches || ev.pointerType === 'touch') {
		return
	}

	const header = (ev.target as Element | null)?.closest<HTMLElement>(HEADER)
	if(header !== active) {
		clear()
		active = header ?? undefined
	}

	if(!header) {
		return
	}

	const rect = header.getBoundingClientRect()
	x = ev.clientX - rect.left
	y = ev.clientY - rect.top
	frame ||= requestAnimationFrame(() => {
		frame = 0
		if(!active?.isConnected) {
			return
		}

		active.style.setProperty('--sx', `${x}px`)
		active.style.setProperty('--sy', `${y}px`)
		active.classList.add('is-spotlit')
	})
}, { passive: true })

document.addEventListener('pointerleave', clear)
document.documentElement.addEventListener('pointerleave', clear)
window.addEventListener('blur', clear)

function clear() {
	cancelAnimationFrame(frame)
	frame = 0
	active?.classList.remove('is-spotlit')
	active = undefined
}
