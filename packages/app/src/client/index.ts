/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
import { showToast } from '@reclaimprotocol/design/behaviors'
import HTMX from 'htmx.org'
import 'htmx-ext-response-targets'
// SSE extension: a status element re-fetches its fragment on each `sse:`
// event (fed by pgmb) instead of tight polling.
import 'htmx-ext-sse'
import './behaviors.ts'
import './key-export.ts'
import './wallet.ts'
import './world-id.ts'
import './reclaim.ts'
import './live.ts'
import './order-estimate.ts'
import './chain-trade.ts'
import './price-flash.ts'
import './diwali-effects.ts'
import './launch-form.ts'
import './hedera-pay.ts'
import './chart-interval.ts'
import './section-nav.ts'
import './watchlist.ts'
import './ticker.ts'
import './spotlight.ts'
import './escrow-meter.ts'
import './countdown.ts'
import './activity-pulse.ts'
import './card-tilt.ts'
import './coin-trail.ts'
import './proof-moment.ts'

/**
 * Browser entry point. Bundled by Vite into a single ESM and loaded
 * once at the bottom of every HTML page (see `Layout.tsx`). It:
 *
 *   1. Boots HTMX and the `response-targets` extension so 4xx/5xx
 *      bodies are funneled into each form's inline `.form-error`.
 *   2. Side-loads behavior modules (`behaviors.ts`, and each feature module
 *      the domain workstreams add) that attach delegated listeners to
 *      `document`, so no per-page wiring is needed.
 */

declare global {
	var htmx: typeof HTMX.default
}

// @ts-expect-error htmx.org's type export shape is misaligned;
// assignment is correct at runtime.
window.htmx = HTMX

// Response-targets extension config — see:
// https://htmx.org/extensions/response-targets/
// `responseTargetPrefersExisting` is deliberately NOT set: with it on,
// the extension reuses the success target for every 4xx/5xx response
// AND clears `evt.detail.isError`, so 400s would look like successes.
Object.assign(window.htmx.config, {
	responseTargetUnsetsError: true,
})

// Inline `json-enc` extension. Sends `Content-Type: application/json` and
// JSON-encodes the request body for any form opting in via
// `hx-ext="json-enc"`. The official extension stringifies htmx's flattened
// FormData; this one first stashes the raw parameters so a script can merge
// structured state (for example, a signed World ID proof) into the body
// before it is encoded.
window.htmx.defineExtension('json-enc', {
	onEvent(name, evt) {
		if(name === 'htmx:configRequest') {
			const detail = (
				evt as CustomEvent<{
					headers: Record<string, string>
					parameters: unknown
					elt: HTMLElement
				}>
			).detail
			detail.headers['Content-Type'] = 'application/json';
			(detail.elt as (typeof detail.elt) & { __hxJsonBody?: unknown })
				.__hxJsonBody = detail.parameters
		}

		return true
	},
	encodeParameters(xhr, parameters, elt) {
		xhr.overrideMimeType('text/json')
		const slot = elt as HTMLElement & { __hxJsonBody?: unknown }
		const stashed = slot.__hxJsonBody
		delete slot.__hxJsonBody
		const body =
			stashed ??
			(parameters instanceof FormData
				? Object.fromEntries(parameters)
				: parameters)
		return JSON.stringify(body)
	},
})

// An error swapped into a form's `.form-error` shows the problem's detail,
// not the raw JSON document.
document.addEventListener('htmx:beforeSwap', ((
	ev: CustomEvent<{ xhr: XMLHttpRequest, serverResponse: string }>,
) => {
	const { xhr } = ev.detail
	if(
		xhr.status < 400
		|| !xhr.getResponseHeader('content-type')?.includes('problem+json')
	) {
		return
	}

	let message = xhr.statusText || 'Request failed'
	try {
		const body = JSON.parse(xhr.responseText) as {
			detail?: string
			title?: string
		}
		message = body.detail || body.title || message
	} catch{}

	const out = document.createElement('span')
	out.textContent = message
	ev.detail.serverResponse = out.innerHTML
}) as EventListener)

// Listen for HTMX errors on requests that don't have a form-error target
document.addEventListener('htmx:responseError', ((
	ev: CustomEvent<{
		xhr: XMLHttpRequest
		target: HTMLElement
	}>,
) => {
	const { xhr, target } = ev.detail

	// Skip if the target has a .form-error element (HxForm handles it)
	if(target.closest('form')?.querySelector('.form-error')) {
		return
	}

	// Skip if there's a specific hx-target-error set
	const trigger = ev.target as HTMLElement
	if(
		trigger.hasAttribute('hx-target-error') ||
		trigger.hasAttribute('hx-target-4*')
	) {
		return
	}

	// Extract error message from response
	let message = 'Request failed'
	try {
		const body = JSON.parse(xhr.responseText) as {
			detail?: string
			title?: string
		}
		message = body.detail || body.title || message
	} catch{
		message = xhr.statusText || message
	}

	showToast(message, { tone: 'danger' })
}) as EventListener)
