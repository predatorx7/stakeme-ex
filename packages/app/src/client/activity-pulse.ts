/// <reference lib="dom" />

/**
 * Live activity pulse. Containers marked `data-live-list="<name>"` are
 * watched with one MutationObserver. Rows that appear after the first sight
 * of a list (SSE `afterbegin` inserts, or an htmx region reload) slide in and
 * get a brief gold highlight (`is-live-new`, styled in `activity-pulse.css`).
 *
 * If the list top is out of view (list scrolled, or page scrolled past it),
 * the view is left alone and a sticky "N new events" pill counts the arrivals.
 * Clicking it scrolls to the list top and clears the count. The noun is
 * `data-live-noun` (default "event").
 *
 * Seen row keys are kept per list name, so a list replaced by htmx does not
 * re-animate the rows it already showed. Row key: `data-event-id`, else `id`,
 * else `data-live-key`, else the row text.
 */

const LIST = '[data-live-list]'
const MAX_SEEN = 1000
const HIGHLIGHT_MS = 1300

const seen = new Map<string, Set<string>>()
const counts = new Map<string, number>()
type Pill = { slot: HTMLElement, button: HTMLButtonElement }
const slots = new WeakMap<HTMLElement, Pill>()

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches

function nameOf(list: HTMLElement) {
	return list.dataset.liveList || 'default'
}

function keyOf(row: HTMLElement) {
	return row.dataset.eventId
		|| row.id
		|| row.dataset.liveKey
		|| (row.textContent ?? '').replace(/\s+/g, ' ').trim()
}

function topHidden(list: HTMLElement) {
	const top = list.getBoundingClientRect().top
	return list.scrollTop > 8 || top < 0 || top > innerHeight
}

function pillFor(list: HTMLElement) {
	let entry = slots.get(list)
	if(!entry) {
		const slot = document.createElement('div')
		slot.className = 'smx-live-pill-slot'
		const button = document.createElement('button')
		button.type = 'button'
		button.className = 'smx-live-pill'
		button.hidden = true
		button.addEventListener('click', () => {
			list.scrollTo({ top: 0 })
			list.scrollIntoView({
				block: 'start',
				behavior: reduced() ? 'auto' : 'smooth',
			})
			setCount(list, 0)
		})
		slot.append(button)
		entry = { slot, button }
		slots.set(list, entry)
	}

	// An htmx swap may have dropped the slot; put it back before the list.
	if(entry.slot.nextElementSibling !== list) {
		list.before(entry.slot)
	}

	return entry
}

function setCount(list: HTMLElement, n: number) {
	counts.set(nameOf(list), n)
	const { button } = pillFor(list)
	const noun = list.dataset.liveNoun || 'event'
	button.hidden = n === 0
	button.textContent = `${n} new ${noun}${n === 1 ? '' : 's'}`
}

function pulse(row: HTMLElement) {
	row.classList.add('is-live-new')
	const done = () => row.classList.remove('is-live-new')
	row.addEventListener('animationend', (ev) => {
		if(ev.target === row && ev.animationName === 'smx-live-highlight') {
			done()
		}
	})
	// Fallback if animationend never fires (hidden tab, animations off).
	setTimeout(done, HIGHLIGHT_MS + 200)
}

function scan(list: HTMLElement) {
	const name = nameOf(list)
	const rows = [...list.children].filter(
		(el): el is HTMLElement => el instanceof HTMLElement,
	)
	const known = seen.get(name)
	if(!known) {
		seen.set(name, new Set(rows.map(keyOf)))
		pillFor(list)
		return
	}

	const fresh = rows.filter((row) => !known.has(keyOf(row)))
	for(const row of rows) {
		known.add(keyOf(row))
	}

	if(known.size > MAX_SEEN) {
		seen.set(name, new Set(rows.map(keyOf)))
	}

	if(!fresh.length) {
		return
	}

	for(const row of fresh) {
		pulse(row)
	}

	if(topHidden(list)) {
		setCount(list, (counts.get(name) ?? 0) + fresh.length)
	}
}

function onScroll() {
	for(const list of document.querySelectorAll<HTMLElement>(LIST)) {
		if((counts.get(nameOf(list)) ?? 0) > 0 && !topHidden(list)) {
			setCount(list, 0)
		}
	}
}

function listsIn(node: Node, out: Set<HTMLElement>) {
	const el = node instanceof Element ? node : node.parentElement
	const own = el?.closest<HTMLElement>(LIST)
	if(own) {
		out.add(own)
	}

	if(node instanceof Element) {
		for(const inner of node.querySelectorAll<HTMLElement>(LIST)) {
			out.add(inner)
		}
	}
}

function init() {
	for(const list of document.querySelectorAll<HTMLElement>(LIST)) {
		scan(list)
	}

	new MutationObserver((mutations) => {
		const lists = new Set<HTMLElement>()
		for(const m of mutations) {
			for(const node of m.addedNodes) {
				listsIn(node, lists)
			}
		}

		for(const list of lists) {
			scan(list)
		}
	}).observe(document.body, { childList: true, subtree: true })

	addEventListener('scroll', onScroll, { passive: true })
	document.addEventListener('scroll', onScroll, {
		passive: true,
		capture: true,
	})
}

if(document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', init)
} else {
	init()
}
