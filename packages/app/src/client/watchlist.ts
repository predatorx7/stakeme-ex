/// <reference lib="dom" />
import { showToast } from '@reclaimprotocol/design/behaviors'

/**
 * Watchlist glue, all delegated on `document`:
 *
 *   [data-watchlist-toggle]  click: PUT or DELETE `/watchlist/{ticker}`,
 *                            flip `aria-pressed`, toast. A 401 opens the
 *                            wallet sign-in instead.
 *   [data-watchlist-open]    click: re-fetch `GET /watchlist` and rebuild the
 *                            drawer rows from its `<template>`.
 */

type Summary = {
	ticker: string
	price: string
	change24h: number
	sparkline: Array<{ price: string }>
}

const PRICE = new Intl.NumberFormat('en-US', {
	style: 'currency',
	currency: 'USD',
	maximumFractionDigits: 4,
})

document.addEventListener('click', (event) => {
	const target = event.target as Element | null
	const toggle = target?.closest<HTMLButtonElement>('[data-watchlist-toggle]')
	if(toggle) {
		void onToggle(toggle)
		return
	}

	if(target?.closest('[data-watchlist-open]')) {
		void refresh()
	}
})

async function onToggle(button: HTMLButtonElement) {
	const { ticker } = button.dataset
	if(!ticker || button.getAttribute('aria-busy') === 'true') {
		return
	}

	const add = button.getAttribute('aria-pressed') !== 'true'
	button.setAttribute('aria-busy', 'true')
	try {
		const res = await fetch(`/watchlist/${encodeURIComponent(ticker)}`, {
			method: add ? 'PUT' : 'DELETE',
			headers: { accept: 'application/json' },
		})
		if(res.status === 401) {
			signIn()
			return
		}

		if(!res.ok) {
			throw new Error(await problem(res))
		}

		setWatched(ticker, add)
		showToast(
			`${ticker} ${add ? 'added to' : 'removed from'} watchlist.`,
			{ tone: add ? 'success' : 'info' },
		)
	} catch(err) {
		showToast(
			err instanceof Error ? err.message : 'Could not update watchlist.',
			{ tone: 'danger' },
		)
	} finally {
		button.removeAttribute('aria-busy')
	}
}

/** Tickers the viewer watches, from one `GET /watchlist`; null until loaded. */
let watched: Set<string> | null = null
let loading = false

/** Mark stars on the page from the watchlist. Fetches once, only when a star
 *  outside the drawer exists (that renders for signed-in viewers only). */
async function paintStars() {
	const stars = document.querySelectorAll<HTMLButtonElement>(
		'[data-watchlist-toggle]:not([data-watchlist-item] *)',
	)
	if(!stars.length) {
		return
	}

	if(!watched && !loading) {
		loading = true
		try {
			const res = await fetch('/watchlist', {
				headers: { accept: 'application/json' },
			})
			if(res.ok) {
				const body = await res.json() as { items?: Summary[] }
				watched = new Set((body.items || []).map((i) => i.ticker))
			}
		} catch{} finally {
			loading = false
		}
	}

	for(const star of stars) {
		if(watched?.has(star.dataset.ticker || '')) {
			setWatched(star.dataset.ticker!, true, false)
		}
	}
}

document.addEventListener('htmx:afterSettle', () => void paintStars())
void paintStars()

/** Sync every star for `ticker`; in the drawer, an unstarred row goes away. */
function setWatched(ticker: string, isWatched: boolean, track = true) {
	if(track) {
		watched?.[isWatched ? 'add' : 'delete'](ticker)
	}

	for(const button of document.querySelectorAll<HTMLButtonElement>(
		'[data-watchlist-toggle]',
	)) {
		if(button.dataset.ticker !== ticker) {
			continue
		}

		button.setAttribute('aria-pressed', String(isWatched))
		button.setAttribute(
			'aria-label',
			`${isWatched ? 'Remove' : 'Add'} ${ticker} `
				+ `${isWatched ? 'from' : 'to'} watchlist`,
		)
		button.title = isWatched ? 'Remove from watchlist' : 'Add to watchlist'
		const row = button.closest('[data-watchlist-item]')
		if(row && !isWatched) {
			row.remove()
		}
	}

	syncEmpty()
}

async function refresh() {
	const drawer = document.querySelector<HTMLElement>('.smx-watchlist')
	const list = drawer?.querySelector('[data-watchlist-list]')
	const template = drawer?.querySelector<HTMLTemplateElement>(
		'template[data-watchlist-row]',
	)
	if(!list || !template) {
		return
	}

	try {
		const res = await fetch('/watchlist', {
			headers: { accept: 'application/json' },
		})
		if(res.status === 401) {
			(drawer as HTMLDialogElement).close?.()
			signIn()
			return
		}

		if(!res.ok) {
			throw new Error(await problem(res))
		}

		const body = await res.json() as { items?: Summary[] } | Summary[]
		const items = Array.isArray(body) ? body : body.items || []
		list.replaceChildren(...items.map((item) => row(template, item)))
		syncEmpty()
	} catch(err) {
		showToast(
			err instanceof Error ? err.message : 'Could not load watchlist.',
			{ tone: 'danger' },
		)
	}
}

function row(template: HTMLTemplateElement, item: Summary) {
	const li = (template.content.cloneNode(true) as DocumentFragment)
		.firstElementChild as HTMLElement
	const path = `/creators/${encodeURIComponent(item.ticker)}`
	const link = li.querySelector<HTMLAnchorElement>('[data-wl=ticker]')!
	link.href = path
	link.textContent = item.ticker
	li.querySelector('[data-wl=price]')!.textContent = PRICE.format(
		Number(item.price),
	)
	for(const key of ['buy', 'sell']) {
		li.querySelector<HTMLAnchorElement>(`[data-wl=${key}]`)!.href =
			`${path}#trade`
	}

	const change = li.querySelector<HTMLElement>('.smx-change')!
	const pct = item.change24h
	change.dataset.dir = pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat'
	change.textContent = `${pct > 0 ? '+' : ''}${pct.toFixed(2)}%`

	const spark = li.querySelector<SVGElement>('.smx-spark')!
	const values = item.sparkline.map((p) => Number(p.price))
	if(values.length > 1) {
		const min = Math.min(...values)
		const span = Math.max(...values) - min || 1
		spark.querySelector('path')!.setAttribute(
			'd',
			values.map((v, i) => {
				const x = i / (values.length - 1) * 100
				const y = 26 - (v - min) / span * 24
				return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`
			}).join(' '),
		)
		spark.dataset.dir = values[values.length - 1] >= values[0] ? 'up' : 'down'
		spark.setAttribute('aria-label', `${item.ticker} price trend`)
	} else {
		spark.replaceChildren()
	}

	const star = li.querySelector<HTMLButtonElement>('[data-watchlist-toggle]')!
	star.dataset.ticker = item.ticker
	star.setAttribute('aria-label', `Remove ${item.ticker} from watchlist`)
	return li
}

function syncEmpty() {
	for(const drawer of document.querySelectorAll('.smx-watchlist')) {
		const empty = drawer.querySelector<HTMLElement>('[data-watchlist-empty]')
		if(empty) {
			empty.hidden = !!drawer.querySelector('[data-watchlist-item]')
		}
	}
}

/** Signed out: reuse the existing wallet sign-in flow. */
function signIn() {
	const connect = document.querySelector<HTMLElement>(
		'[data-wallet-connect]:not([data-wallet-redirect])',
	) || document.querySelector<HTMLElement>('[data-wallet-connect]')
	if(connect) {
		connect.click()
	} else {
		showToast('Sign in to use your watchlist.', { tone: 'info' })
	}
}

async function problem(res: Response) {
	try {
		const body = await res.json() as { detail?: string, title?: string }
		return body.detail || body.title || res.statusText
	} catch{
		return res.statusText || 'Request failed'
	}
}
