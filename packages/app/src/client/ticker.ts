/// <reference lib="dom" />

/**
 * Live ticker strip. Updates `[data-ticker-item]` links from `TRADE` events
 * on the page's existing htmx SSE connection (`oracle-event-json`); no second
 * EventSource is opened. The change is recomputed from `data-base`, the
 * price 24h ago. Delegated and idempotent: sources are bound once, and
 * nothing is cached on DOM nodes that htmx may swap.
 */

type Hooked = Element & {
	'htmx-internal-data'?: { sseEventSource?: EventSource }
}

const bound = new WeakSet<EventSource>()

function fmtPrice(price: number) {
	return price.toLocaleString('en-US', {
		minimumFractionDigits: 2,
		maximumFractionDigits: 4,
	})
}

function bind(source: EventSource | undefined) {
	if(!source || bound.has(source)) {
		return
	}

	bound.add(source)
	source.addEventListener('oracle-event-json', (event) => {
		try {
			const e = JSON.parse((event as MessageEvent<string>).data) as {
				kind?: string
				ticker?: string
				payload?: { price?: string }
			}
			if(e.kind === 'TRADE' && e.ticker && e.payload?.price) {
				apply(e.ticker, Number(e.payload.price))
			}
		} catch{}
	})
}

function apply(ticker: string, price: number) {
	if(!Number.isFinite(price) || price <= 0) {
		return
	}

	const links = document.querySelectorAll<HTMLElement>(
		`[data-ticker-item="${CSS.escape(ticker)}"]`,
	)
	for(const link of links) {
		const base = Number(link.dataset.base)
		const change = base > 0 ? (price / base - 1) * 100 : 0
		const rounded = Math.round(change * 10) / 10
		const dir = rounded > 0 ? 'up' : rounded < 0 ? 'down' : 'flat'
		const priceEl = link.querySelector('[data-ticker-price]')
		const changeEl = link.querySelector('[data-ticker-change]')
		if(priceEl) {
			priceEl.textContent = fmtPrice(price)
		}

		if(changeEl) {
			const glyph = dir === 'up' ? '▲' : dir === 'down' ? '▼' : ''
			changeEl.textContent = `${glyph}${Math.abs(rounded).toFixed(1)}%`
		}

		link.dataset.dir = dir
	}
}

function scan() {
	for(const el of document.querySelectorAll('[sse-connect]')) {
		// htmx keeps the source in its internal data; reuse it, don't reconnect.
		bind((el as Hooked)['htmx-internal-data']?.sseEventSource)
	}
}

document.addEventListener('htmx:sseOpen', (event) => {
	bind((event as CustomEvent<{ source?: EventSource }>).detail?.source)
})
document.addEventListener('htmx:load', scan)
document.addEventListener('htmx:afterSwap', scan)
scan()
