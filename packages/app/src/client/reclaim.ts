/// <reference lib="dom" />
import {
	pick,
	postJson,
	reloadOrRedirect,
	renderLinkAndQr,
	toastError,
} from './web3-util.ts'

/**
 * Reclaim proof flow in the browser. Delegated; never polls: the server
 * streams PROOF_VERIFIED over SSE and htmx swaps the status fragment.
 *
 *   [data-reclaim-start="/url"]  click: POST the session route (JSON body from
 *                                optional `data-reclaim-body`), then render the
 *                                request link + QR into `[data-reclaim-output]`
 *                                (searched in the closest `[data-reclaim]` or
 *                                the document).
 *   [data-reclaim-demo="/url"]   DEMO_MODE only: POST a fixture proof
 *       data-reclaim-demo-context  creator id echoed back (required)
 *       data-reclaim-demo-amount   USDC decimal (default 5000.00)
 *       data-reclaim-demo-field    body key for the proof (default `proof`)
 *       data-reclaim-body          extra JSON body fields
 *
 * Contract: docs/frontend-hooks.md.
 */

document.addEventListener('click', (event) => {
	const target = event.target as Element | null
	const start = target?.closest<HTMLElement>('[data-reclaim-start]')
	if(start) {
		event.preventDefault()
		busy(start, startSession(start))
		return
	}

	const demo = target?.closest<HTMLElement>('[data-reclaim-demo]')
	if(demo) {
		event.preventDefault()
		busy(demo, submitDemo(demo))
	}
})

async function startSession(button: HTMLElement) {
	const url = button.dataset.reclaimStart
	if(!url) {
		throw new Error('data-reclaim-start needs a URL')
	}

	const { json } = await postJson(url, extraBody(button))
	// Accept `{ requestUrl }` or `{ session: { requestUrl } }`.
	const session = pick(json, 'session') ?? json
	const requestUrl = pick(session, 'requestUrl')
	if(typeof requestUrl !== 'string') {
		throw new Error('Server returned no Reclaim request URL')
	}

	const host = outputOf(button)
	if(host) {
		await renderLinkAndQr(host, requestUrl, 'Open Reclaim verification')
	} else {
		window.open(requestUrl, '_blank', 'noopener')
	}
}

async function submitDemo(button: HTMLElement) {
	const url = button.dataset.reclaimDemo
	const context = button.dataset.reclaimDemoContext
	if(!url || !context) {
		throw new Error(
			'data-reclaim-demo and data-reclaim-demo-context are required',
		)
	}

	// Matches the server's `demoIncomeProof`; only accepted when DEMO_MODE=1.
	const fixture = {
		demo: true,
		amount: button.dataset.reclaimDemoAmount || '5000.00',
		context,
		id: `0xdemo${crypto.randomUUID().replaceAll('-', '')}`,
	}
	const { headers } = await postJson(url, {
		...extraBody(button),
		[button.dataset.reclaimDemoField || 'proof']: fixture,
	})
	reloadOrRedirect(headers)
}

function extraBody(el: HTMLElement): Record<string, unknown> {
	try {
		const parsed: unknown = JSON.parse(el.dataset.reclaimBody || '{}')
		return parsed && typeof parsed === 'object'
			? parsed as Record<string, unknown>
			: {}
	} catch{
		return {}
	}
}

function outputOf(el: HTMLElement) {
	const scope = el.closest('[data-reclaim]') || document
	return scope.querySelector<HTMLElement>('[data-reclaim-output]')
}

function busy(el: HTMLElement, task: Promise<unknown>) {
	el.setAttribute('aria-busy', 'true')
	task.catch(toastError).finally(() => el.removeAttribute('aria-busy'))
}
