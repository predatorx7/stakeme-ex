/// <reference lib="dom" />
import { showToast } from '@reclaimprotocol/design/behaviors'

/** Shows a danger toast for any thrown value. */
export function toastError(err: unknown) {
	const message = err instanceof Error ? err.message : String(err)
	showToast(message, { tone: 'danger' })
}

/**
 * POSTs JSON and returns the parsed body (or `undefined` for an empty one).
 * Throws the problem+json `detail` on a non-2xx response.
 */
export async function postJson(url: string, body?: unknown) {
	const res = await fetch(url, {
		method: 'POST',
		credentials: 'same-origin',
		headers: { 'content-type': 'application/json', accept: 'application/json' },
		body: JSON.stringify(body ?? {}),
	})
	const text = await res.text()
	let json: unknown
	try {
		json = text ? JSON.parse(text) : undefined
	} catch{}

	if(!res.ok) {
		const problem = json as { detail?: string, title?: string } | undefined
		throw new Error(
			problem?.detail || problem?.title || `Request failed (${res.status})`,
		)
	}

	return { json, headers: res.headers }
}

/** Reads `value[key]` from an untrusted JSON value. */
export function pick(value: unknown, key: string): unknown {
	return value && typeof value === 'object'
		? (value as Record<string, unknown>)[key]
		: undefined
}

/** Replaces `host`'s content with a link to `url` plus a QR image of it. */
export async function renderLinkAndQr(
	host: HTMLElement,
	url: string,
	label: string,
) {
	host.replaceChildren()
	const link = document.createElement('a')
	link.href = url
	link.target = '_blank'
	link.rel = 'noopener noreferrer'
	link.textContent = label
	host.append(link)

	try {
		const { toDataURL } = await import('qrcode')
		const img = document.createElement('img')
		img.alt = 'QR code'
		img.width = img.height = 192
		img.src = await toDataURL(url, { margin: 1, width: 192 })
		host.prepend(img)
	} catch{
		// The link alone still works.
	}

	host.hidden = false
}

/** Reloads, or follows an `HX-Redirect` the server sent. */
export function reloadOrRedirect(headers?: Headers) {
	const target = headers?.get('HX-Redirect')
	if(target) {
		location.assign(target)
	} else {
		location.reload()
	}
}
