/// <reference lib="dom" />

/**
 * Diwali effects: sparkle bursts on `[data-dw-sparkle]` clicks and a brief
 * sparkler on `smx:celebrate` (also fired for success triggers). Particles are
 * CSS-animated spans in one fixed, inert, aria-hidden overlay. No-ops under
 * `prefers-reduced-motion: reduce`.
 */

const COLORS = ['#f5b942', '#f28c28', '#ffd87a', '#ff9f43']
const MAX_PARTICLES = 40
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')

let overlay: HTMLElement | undefined
let live = 0

function getOverlay() {
	if(!overlay?.isConnected) {
		overlay = document.createElement('div')
		overlay.className = 'smx-dw-fx'
		overlay.setAttribute('aria-hidden', 'true')
		overlay.inert = true
		document.body.appendChild(overlay)
	}

	return overlay
}

const rand = (min: number, max: number) => min + Math.random() * (max - min)

function spark(
	x: number,
	y: number,
	angle: number,
	dist: number,
	gravity: number,
	duration: number,
	delay = 0,
) {
	if(live >= MAX_PARTICLES) {
		return
	}

	live++
	const el = document.createElement('span')
	el.className = 'smx-dw-spark'
	const s = el.style
	s.setProperty('--x0', `${x}px`)
	s.setProperty('--y0', `${y}px`)
	s.setProperty('--x1', `${x + Math.cos(angle) * dist}px`)
	s.setProperty('--y1', `${y + Math.sin(angle) * dist + gravity}px`)
	s.setProperty('--c', COLORS[Math.floor(Math.random() * COLORS.length)])
	s.setProperty('--s', `${rand(2, 4.5).toFixed(1)}px`)
	s.setProperty('--d', `${duration}ms`)
	s.setProperty('--delay', `${delay}ms`)
	getOverlay().appendChild(el)
	setTimeout(() => {
		el.remove()
		live--
	}, duration + delay + 80)
}

function sparkleBurst(x: number, y: number) {
	const n = 6 + Math.floor(Math.random() * 5)
	for(let i = 0; i < n; i++) {
		const angle = i / n * Math.PI * 2 + rand(-0.3, 0.3)
		spark(x, y, angle, rand(18, 42), rand(4, 12), 650)
	}
}

function celebrate(target?: Element | null) {
	let x = window.innerWidth / 2
	let y = Math.min(120, window.innerHeight / 4)
	if(target && target !== document.body) {
		const r = target.getBoundingClientRect()
		if(r.width || r.height) {
			x = r.left + r.width / 2
			y = r.top + r.height / 2
		}
	}

	// Phuljhari: radial sparks fanning out with a downward fall, staggered.
	for(let i = 0; i < MAX_PARTICLES; i++) {
		spark(
			x,
			y,
			rand(0, Math.PI * 2),
			rand(30, 110),
			rand(20, 70),
			rand(700, 1000),
			rand(0, 200),
		)
	}
}

document.addEventListener('click', (ev) => {
	if(reduced.matches || !(ev.target instanceof Element)) {
		return
	}

	if(!ev.target.closest('[data-dw-sparkle]')) {
		return
	}

	// Keyboard-activated clicks report 0,0: use the element's centre.
	let { clientX: x, clientY: y } = ev
	if(!x && !y) {
		const r = ev.target.getBoundingClientRect()
		x = r.left + r.width / 2
		y = r.top + r.height / 2
	}

	sparkleBurst(x, y)
})

document.addEventListener('smx:celebrate', (ev) => {
	if(!reduced.matches) {
		celebrate(ev.target instanceof Element ? ev.target : null)
	}
}, true) // capture, so non-bubbling dispatches are heard too

function fire(target?: EventTarget | null) {
	const el = target instanceof Element ? target : document.body
	el.dispatchEvent(new CustomEvent('smx:celebrate', { bubbles: true }))
}

// Success triggers. HX-Trigger events are fired on the requesting element and
// bubble, so the burst lands near it.
for(const name of ['smx:ipo-launched', 'smx:dividend-paid']) {
	document.body.addEventListener(name, (ev) => fire(ev.target))
}

// Success-only oracle event kinds (sql oracle_event_kind). Rejections, grace,
// freeze, default, trades and storage events never celebrate. IPO is covered
// by the `smx:ipo-launched` HX-Trigger.
const CELEBRATE_KINDS = new Set([
	'PROOF_VERIFIED',
	'TRANCHE_RELEASED',
	'DIVIDEND_PAID',
])

// live.ts dispatches `smx:oracle-event` with `detail: { kind }`.
document.body.addEventListener('smx:oracle-event', (ev) => {
	const kind = (ev as CustomEvent<{ kind?: string }>).detail?.kind ?? ''
	if(CELEBRATE_KINDS.has(kind)) {
		fire(null)
	}
})
