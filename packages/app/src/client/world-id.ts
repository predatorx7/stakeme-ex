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
 *       data-check-url         POST route that verifies the proof and rejects
 *                              a used or banned nullifier
 *                              (default `/api/world-id/check`).
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
const DEFAULT_CHECK_URL = '/api/world-id/check'
const DEFAULT_ACTION = 'smx-launch-ipo'

document.addEventListener('click', (event) => {
	const target = event.target as Element | null
	const sim = target?.closest<HTMLElement>('[data-world-id-sim]')
	if(sim) {
		event.preventDefault()
		const kind = sim.dataset.worldIdSim === 'sybil' ? 'sybil' : 'success'
		const trigger = sim.closest('form')
			?.querySelector<HTMLElement>('[data-world-id]')
		if(trigger?.dataset.appId) {
			// Real World ID is configured: simulators never run.
			return
		}

		sim.setAttribute('aria-busy', 'true')
		void deliver(sim, demoProof(kind, trigger?.dataset.action), 'Simulated')
			.finally(() => sim.removeAttribute('aria-busy'))
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

	// A second click while waiting cancels the pending request.
	const pending = pendingRequests.get(trigger)
	if(pending) {
		pending.abort()
		return
	}

	const controller = new AbortController()
	pendingRequests.set(trigger, controller)
	trigger.setAttribute('aria-busy', 'true')
	void runIdKit(trigger, controller.signal)
		.catch((err) => {
			// Config or network failure before/while polling. Keep submit off.
			lockSubmit(trigger)
			setStatus(
				trigger,
				`World ID could not start: ${(err as Error).message}. Try again.`,
				'danger',
			)
			toastError(err)
		})
		.finally(() => {
			pendingRequests.delete(trigger)
			trigger.removeAttribute('aria-busy')
			clearQr(trigger)
		})
})

const pendingRequests = new WeakMap<HTMLElement, AbortController>()

/**
 * Messages for IDKit failure codes (`IDKitErrorCodes` in
 * `@worldcoin/idkit-core`; the enum values are these strings). Anything else
 * falls back to the raw code. Every one of them leaves submit disabled.
 */
const RETRY = 'Press Verify with World ID to retry.'
const ERROR_MESSAGES: Record<string, string> = {
	cancelled: `Verification cancelled. ${RETRY}`,
	user_rejected: `You declined in World App. ${RETRY}`,
	verification_rejected: `World App rejected the verification. ${RETRY}`,
	timeout: `Timed out after 2 minutes. ${RETRY}`,
	credential_unavailable:
		'This World ID has no proof-of-human credential, so it cannot launch.',
	max_verifications_reached:
		'This World ID already used its verifications for this action.',
	nullifier_replayed: 'This World ID proof was already used.',
	connection_failed: `Could not reach World App. ${RETRY}`,
	rp_signature_expired: `The request expired. ${RETRY}`,
	invalid_rp_signature:
		'World ID rejected the server signature (RP misconfigured).',
}

async function runIdKit(trigger: HTMLElement, abortSignal: AbortSignal) {
	lockSubmit(trigger)
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
	const completion = await request.pollUntilCompletion({
		timeout: 120_000,
		signal: abortSignal,
	})
	if(!completion.success) {
		// Cancelled, declined in World App, timed out, credential missing...
		const code = String(completion.error)
		setStatus(
			trigger,
			ERROR_MESSAGES[code] || `World ID failed (${code}). ${RETRY}`,
			code === 'cancelled' ? undefined : 'danger',
		)
		return
	}

	await deliver(trigger, completion.result, 'Verified')
}

/**
 * Asks the server to verify the proof and check its nullifier, then writes the
 * proof into the form's hidden input and enables submit. A Sybil (nullifier
 * already used) or a banned human keeps submit disabled and sees why.
 */
async function deliver(from: HTMLElement, proof: unknown, label: string) {
	const form = formOf(from)
	const input = form
		?.querySelector<HTMLInputElement>('input[name=worldIdProof]')
	if(!form || !input) {
		throw new Error('World ID form is missing input[name=worldIdProof]')
	}

	const submits = form.querySelectorAll<HTMLButtonElement>(
		'[data-world-id-submit], button[type=submit]',
	)
	input.value = ''
	for(const submit of submits) {
		submit.disabled = true
	}

	setStatus(from, 'Checking World ID...')
	const trigger = form.querySelector<HTMLElement>('[data-world-id]')
	try {
		await postJson(
			trigger?.dataset.checkUrl || DEFAULT_CHECK_URL,
			{ worldIdProof: proof },
		)
	} catch(err) {
		setStatus(from, rejectionMessage(err), 'danger')
		return
	}

	input.value = JSON.stringify(proof)
	for(const submit of submits) {
		submit.disabled = false
	}

	setStatus(from, `${label} as a unique human.`, 'success')
	form.dispatchEvent(
		new CustomEvent('smx:world-id', { bubbles: true, detail: proof }),
	)
}

/** Short, clear text for the server's 409 and 403 refusals. */
function rejectionMessage(err: unknown) {
	const raw = err instanceof Error ? err.message : String(err)
	const text = raw.toLowerCase()
	if(text.includes('already launched')) {
		return 'Rejected: this person already launched an IPO. One human, one IPO.'
	}

	if(text.includes('blacklisted')) {
		return 'Rejected: this World ID is blacklisted after a default.'
	}

	return `Rejected: ${raw}`
}

/** Disables submit and clears any previous proof (so a retry starts clean). */
function lockSubmit(from: Element) {
	const form = formOf(from)
	const input = form
		?.querySelector<HTMLInputElement>('input[name=worldIdProof]')
	if(input) {
		input.value = ''
	}

	for(
		const submit of form?.querySelectorAll<HTMLButtonElement>(
			'[data-world-id-submit], button[type=submit]',
		) || []
	) {
		submit.disabled = true
	}
}

function clearQr(from: Element) {
	const qr = formOf(from)?.querySelector<HTMLElement>('[data-world-id-qr]')
	if(qr) {
		qr.replaceChildren()
	}
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

function setStatus(
	from: Element,
	text: string,
	tone?: 'success' | 'danger',
) {
	const status = formOf(from)
		?.querySelector<HTMLElement>('[data-world-id-status]')
	if(!status) {
		return
	}

	status.textContent = text
	if(tone) {
		status.dataset.tone = tone
	} else {
		delete status.dataset.tone
	}
}
