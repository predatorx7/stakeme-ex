/// <reference lib="dom" />

/**
 * Shapes the IPO form's JSON body. htmx flattens every field to a string, but
 * the API wants `worldIdProof` as an object and `shareBps` as basis points, so
 * this listener rewrites `detail.parameters` before the `json-enc` extension
 * stashes it. Marked by `#launch-form`.
 */
document.addEventListener('htmx:configRequest', (event) => {
	const detail = (
		event as CustomEvent<{
			elt: HTMLElement
			parameters: FormData | Record<string, unknown>
		}>
	).detail
	if(detail.elt.id !== 'launch-form') {
		return
	}

	const body: Record<string, unknown> = Object.fromEntries(
		detail.parameters instanceof FormData
			? detail.parameters
			: Object.entries(detail.parameters),
	)
	const proof = body.worldIdProof
	if(typeof proof === 'string' && proof) {
		try {
			body.worldIdProof = JSON.parse(proof)
		} catch{
			// Leave it as text; the server rejects it with a clear error.
		}
	}

	const pct = Number(body.sharePct)
	if(Number.isFinite(pct)) {
		body.shareBps = Math.round(pct * 100)
	}

	delete body.sharePct
	for(const key of ['headline']) {
		if(body[key] === '') {
			delete body[key]
		}
	}

	detail.parameters = body
})

// Reveal the "Verified" pill once World ID fills in the proof.
document.addEventListener('smx:world-id', (event) => {
	const form = (event.target as Element | null)?.closest('form')
	const marks = form?.querySelectorAll<HTMLElement>(
		'[data-world-id-verified]',
	)
	for(const el of marks ?? []) {
		el.hidden = false
	}
})
