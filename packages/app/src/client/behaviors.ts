/// <reference lib="dom" />
import { initReclaimBehaviors } from '@reclaimprotocol/design/behaviors'
import { PAGE_SHELL_ID } from '../components/nav-swap.ts'

let behaviors = start()

// A swapped page shell brings a new theme root and guilloche host.
document.addEventListener('htmx:afterSettle', (event) => {
	const target = (event as CustomEvent<{ target?: unknown }>).detail?.target
	if(target instanceof HTMLElement && target.id === PAGE_SHELL_ID) {
		behaviors.destroy()
		behaviors = start()
	}
})

function start() {
	// The server can only render a dialog open, not modal. Upgrade it.
	for(const dialog of document.querySelectorAll<HTMLDialogElement>(
		'dialog[open]:not(:modal)',
	)) {
		dialog.close()
		dialog.showModal()
	}

	// Reading `localStorage` throws in a sandboxed or storage-blocked frame.
	let storage: Storage | null = null
	try {
		storage = localStorage
	} catch{
		// The theme then follows the system and is not remembered.
	}

	openLinkedTile()
	return initReclaimBehaviors(document, { theme: { storage } })
}

// A link to `#id` opens the folding tile it names (`ExpandableCard`), so a
// change made in a tile, which redirects back to it, lands with it open.
window.addEventListener('hashchange', openLinkedTile)

function openLinkedTile() {
	const id = decodeURIComponent(location.hash.slice(1))
	const tile = id ? document.getElementById(id) : null
	if(tile instanceof HTMLDetailsElement) {
		tile.open = true
		tile.scrollIntoView({ block: 'start' })
	}
}

// The design package's glow controller tracks `<button>`s only, so a link
// styled as `.rc-button` keeps its glow parked in the middle. Track those too.
// Registered once: a swapped page shell keeps the same document.
document.addEventListener('pointermove', (event) => {
	const link = (event.target as Element | null)?.closest?.<HTMLElement>(
		'a.rc-button',
	)
	const bounds = link?.getBoundingClientRect()
	if(!link || !bounds?.width || !bounds.height) {
		return
	}

	const x = ((event.clientX - bounds.left) / bounds.width) * 100
	const y = ((event.clientY - bounds.top) / bounds.height) * 100
	link.style.setProperty('--rc-pointer-x', `${x}%`)
	link.style.setProperty('--rc-pointer-y', `${y}%`)
}, { passive: true })

// A boolean switch posts its hidden `false` only while unchecked, so the
// field is sent exactly once (see `EnabledSwitch`).
document.addEventListener('change', ({ target }) => {
	if(!(target instanceof HTMLInputElement) || target.type !== 'checkbox') {
		return
	}

	const off = target.parentElement?.querySelector<HTMLInputElement>(
		`input[data-switch-off][name="${CSS.escape(target.name)}"]`,
	)
	if(off) {
		off.disabled = target.checked
	}
})

// Server-rendered timestamps come out in UTC; show them in the viewer's own
// timezone instead, including ones htmx swaps in later (the event log).
function localizeTimes(root: ParentNode = document) {
	for(const el of root.querySelectorAll<HTMLTimeElement>(
		'time[data-local-time]',
	)) {
		const date = new Date(el.dateTime)
		if(!Number.isNaN(date.getTime())) {
			// `data-local-time="time"` fits a narrow column: the time of day,
			// with the full local date and time on hover.
			const full = date.toLocaleString(undefined, {
				dateStyle: 'medium',
				timeStyle: 'medium',
			})
			el.textContent = el.dataset.localTime === 'time'
				? date.toLocaleTimeString(undefined, { timeStyle: 'medium' })
				: full
			el.title = full
		}
	}
}

localizeTimes()
document.addEventListener('htmx:afterSettle', () => localizeTimes())
