/// <reference lib="dom" />

/**
 * Chart toolbar glue. The tabs are links that htmx swaps into `#smx-chart`
 * (and pushes to the URL); the swap replaces the focused link, so put focus
 * back on its successor to keep keyboard use unbroken.
 */
let pending: string | undefined

document.addEventListener('htmx:beforeRequest', (ev) => {
	const el = ev.target as HTMLElement | null
	const link = el?.closest<HTMLElement>('.smx-chart-toolbar a')
	pending = link
		? link.dataset.chartInterval
			? `[data-chart-interval="${link.dataset.chartInterval}"]`
			: `[data-chart-mode="${link.dataset.chartMode}"]`
		: undefined
})

document.addEventListener('htmx:afterSettle', (ev) => {
	const el = ev.target as HTMLElement | null
	if(!pending || el?.id !== 'smx-chart') {
		return
	}

	el.querySelector<HTMLElement>(`.smx-chart-toolbar ${pending}`)?.focus()
	pending = undefined
})
