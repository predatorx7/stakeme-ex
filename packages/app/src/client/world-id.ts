/// <reference lib="dom" />
import { pick, postJson, renderLinkAndQr, toastError } from './web3-util.ts'

/**
 * World ID (IDKit core) in the browser. Delegated, no React.
 *
 *   [data-world-id]            trigger. Attributes:
 *       data-app-id            World app id; empty means demo mode.
 *       data-rp-url            POST route returning the RP signature
 *                              (default `/api/rp-signature`).
 *       data-signal            wallet the proof binds to (server-rendered).
 *   form input[name=worldIdProof]  receives the JSON result.
 *   form [data-world-id-submit]    (else the submit button) gets enabled.
 *   [data-world-id-qr]         optional: connect link + QR is rendered here.
 *   [data-world-id-status]     optional: text status.
 *   [data-world-id-demo]       optional: shown (hidden removed) in demo mode.
 *   [data-world-id-sim=success|sybil]  demo buttons posting fixture proofs.
 *
 * Contract: docs/frontend-hooks.md.
 */

const DEFAULT_RP_URL = '/api/rp-signature'
const DEFAULT_ACTION = 'smx-launch-ipo'

document.addEventListener('click', (event) => {
	const target = event.target as Element | null
	const sim = target?.closest<HTMLElement>('[data-world-id-sim]')
	if(sim) {
		event.preventDefault()
		const kind = sim.dataset.worldIdSim === 'sybil' ? 'sybil' : 'success'
		const trigger = sim.closest('form')
			?.querySelector<HTMLElement>('[data-world-id]')
		deliver(sim, demoProof(kind, trigger?.dataset.action), 'Simulated')
		return
	}

	const trigger = target?.closest<HTMLElement>('[data-world-id]')
	if(!trigger) {
		return
	}

	event.preventDefault()
	if(!trigger.dataset.appId) {
		// Demo mode: reveal the simulate buttons.
		const demos = formOf(trigger)
			?.querySelectorAll<HTMLElement>('[data-world-id-demo]')
		for(const el of demos || []) {
			el.hidden = false
		}

		setStatus(trigger, 'Demo mode: choose a simulation.')
		return
	}

	trigger.setAttribute('aria-busy', 'true')
	void runIdKit(trigger)
		.catch(toastError)
		.finally(() => trigger.removeAttribute('aria-busy'))
})

async function runIdKit(trigger: HTMLElement) {
	const rpUrl = trigger.dataset.rpUrl || DEFAULT_RP_URL
	// The server signs the RP context; the signing key never reaches here.
	const { json: rp } = await postJson(rpUrl)
	const rpContext = pick(rp, 'rpContext') as {
		rp_id: string
		nonce: string
		created_at: number
		expires_at: number
		signature: string
	}
	const appId = String(pick(rp, 'appId') || trigger.dataset.appId)
	const signal = String(pick(rp, 'signal') || trigger.dataset.signal || '')
	if(!appId.startsWith('app_') || !rpContext?.signature) {
		throw new Error('World ID is not configured on the server')
	}

	// Loaded on demand: keeps IDKit out of the main bundle.
	const { IDKit, proofOfHuman } = await import('@worldcoin/idkit-core')
	const request = await IDKit.request({
		// Cast: checked above to start with `app_`.
		app_id: appId as `app_${string}`,
		action: String(pick(rp, 'action') || DEFAULT_ACTION),
		rp_context: rpContext,
		allow_legacy_proofs: true,
		environment: pick(rp, 'environment') === 'production'
			? 'production'
			: 'staging',
	}).preset(proofOfHuman({ signal }))

	const qr = formOf(trigger)?.querySelector<HTMLElement>('[data-world-id-qr]')
	if(qr) {
		await renderLinkAndQr(qr, request.connectorURI, 'Open World App')
	}

	setStatus(trigger, 'Waiting for World App...')
	const completion = await request.pollUntilCompletion({ timeout: 120_000 })
	if(!completion.success) {
		throw new Error(`World ID failed: ${String(completion.error)}`)
	}

	deliver(trigger, completion.result, 'Verified')
}

/** Writes the proof into the form's hidden input and enables submit. */
function deliver(from: HTMLElement, proof: unknown, label: string) {
	const form = formOf(from)
	const input = form
		?.querySelector<HTMLInputElement>('input[name=worldIdProof]')
	if(!form || !input) {
		throw new Error('World ID form is missing input[name=worldIdProof]')
	}

	input.value = JSON.stringify(proof)
	for(const submit of form.querySelectorAll<HTMLButtonElement>(
		'[data-world-id-submit], button[type=submit]',
	)) {
		submit.disabled = false
	}

	setStatus(from, `${label} as a unique human.`)
	form.dispatchEvent(
		new CustomEvent('smx:world-id', { bubbles: true, detail: proof }),
	)
}

/** Fixture matching the server's `demoWorldIdProof`. */
function demoProof(kind: 'success' | 'sybil', action = DEFAULT_ACTION) {
	const nonce = crypto.randomUUID()
	return {
		demo: true,
		environment: 'staging',
		action,
		responses: [{
			identifier: 'proof_of_human',
			signal_hash: '0x0',
			nullifier: kind === 'sybil' ? 'smx-demo-sybil' : `smx-demo-${nonce}`,
		}],
	}
}

function formOf(el: Element) {
	return el.closest('form')
}

function setStatus(from: Element, text: string) {
	const status = formOf(from)
		?.querySelector<HTMLElement>('[data-world-id-status]')
	if(status) {
		status.textContent = text
	}
}
