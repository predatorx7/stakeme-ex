/// <reference lib="dom" />
import { showToast } from '@reclaimprotocol/design/behaviors'

/**
 * Live UI glue, all delegated on `document`:
 *
 *   - Toasts for the `HX-Trigger` events the mutation routes send.
 *   - `chain-job` SSE messages flip pending badges to confirmed.
 *   - `oracle-event` SSE messages fire `smx:oracle-event` on the body, which
 *     regions listen to (`hx-trigger`) to reload themselves.
 *   - `[data-countdown]` elements tick once a second.
 *   - Forms with `.hx-form` clear after a successful request.
 */

type JobMessage = {
	id?: string
	creatorId?: string
	status?: string
	txHash?: string | null
}

const TOASTS: Record<string, [string, 'success' | 'info']> = {
	'smx:invested': ['Investment recorded. Onchain call pending.', 'success'],
	'smx:raise-closed': ['Raise closed. Trading is open.', 'success'],
	'smx:traded': ['Trade filled.', 'success'],
	'smx:dividend-paid': ['Dividend paid.', 'success'],
	'smx:ipo-launched': ['IPO launched.', 'success'],
	'smx:reclaim-session': ['Proof session started.', 'info'],
}

for(const [name, [message, tone]] of Object.entries(TOASTS)) {
	document.body.addEventListener(name, () => showToast(message, { tone }))
}

const JOB_LABEL: Record<string, [string, string]> = {
	CONFIRMED: ['Confirmed', 'verified'],
	SIMULATED: ['Simulated', 'sandbox'],
	FAILED: ['Failed', 'failed'],
	SENT: ['Pending', 'pending'],
	QUEUED: ['Pending', 'pending'],
}

// SSE messages. `chain-job` carries JSON, so its swap is cancelled and the
// badges are updated in place instead.
document.addEventListener('htmx:sseBeforeMessage', (event) => {
	const message = (event as CustomEvent).detail as MessageEvent
	if(message.type !== 'chain-job') {
		return
	}

	event.preventDefault()
	let job: JobMessage
	try {
		job = JSON.parse(message.data) as JobMessage
	} catch{
		return
	}

	applyJob(job)
})

document.addEventListener('htmx:sseMessage', (event) => {
	const message = (event as CustomEvent).detail as MessageEvent
	if(message.type !== 'oracle-event') {
		return
	}

	const first = (event.target as Element | null)?.firstElementChild
	const kind = first?.getAttribute('data-kind') ?? ''
	document.body.dispatchEvent(
		new CustomEvent('smx:oracle-event', { detail: { kind } }),
	)
})

function applyJob(job: JobMessage) {
	const settled = job.status && job.status !== 'QUEUED' && job.status !== 'SENT'
	const label = JOB_LABEL[job.status ?? ''] ?? JOB_LABEL.QUEUED
	if(job.id) {
		for(const holder of document.querySelectorAll<HTMLElement>(
			`[data-chain-job="${CSS.escape(job.id)}"]`,
		)) {
			holder.dataset.status = job.status
			const pill = holder.querySelector<HTMLElement>('.rc-pill')
			if(pill) {
				pill.textContent = label[0]
				pill.dataset.tone = label[1]
			}
		}
	}

	if(!settled || !job.creatorId) {
		return
	}

	for(const badge of document.querySelectorAll<HTMLElement>(
		`[data-chain-pending="${CSS.escape(job.creatorId)}"]`,
	)) {
		const count = Math.max(0, Number(badge.dataset.count || 0) - 1)
		badge.dataset.count = String(count)
		badge.hidden = count === 0
		const text = badge.querySelector('[data-chain-pending-label]')
		if(text) {
			text.textContent = count > 1
				? `${count} pending onchain`
				: 'Pending onchain'
		}
	}

	if(job.status === 'CONFIRMED' || job.status === 'SIMULATED') {
		showToast('Transaction confirmed.', { tone: 'success' })
	}
}

// Countdowns
function tick() {
	const now = Date.now()
	for(const el of document.querySelectorAll<HTMLElement>('[data-countdown]')) {
		const ms = Date.parse(el.dataset.countdown ?? '') - now
		el.textContent = formatRemaining(ms)
	}
}

function formatRemaining(ms: number) {
	if(!(ms > 0)) {
		return 'Overdue'
	}

	const s = Math.floor(ms / 1000)
	const d = Math.floor(s / 86400)
	const pad = (n: number) => String(n).padStart(2, '0')
	const h = pad(Math.floor(s % 86400 / 3600))
	const m = pad(Math.floor(s % 3600 / 60))
	return d > 0 ? `${d}d ${h}h ${m}m` : `${h}h ${m}m ${pad(s % 60)}s`
}

setInterval(tick, 1000)

// Clear a form's fields after the server accepted it.
document.addEventListener('htmx:afterRequest', (event) => {
	const detail = (event as CustomEvent<{ successful?: boolean }>).detail
	const form = event.target
	if(
		detail.successful
		&& form instanceof HTMLFormElement
		&& form.classList.contains('smx-form')
		&& form.id !== 'launch-form'
	) {
		const side = form.querySelector<HTMLInputElement>('input[name=side]')
		form.reset()
		if(side) {
			side.checked = true
		}
	}
})
