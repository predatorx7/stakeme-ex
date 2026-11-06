/// <reference lib="dom" />

/**
 * Proof-due countdown. Pure helpers (`formatCountdown`, `countdownTone`,
 * `countdownView`) are shared by the server component and the browser tick.
 * In the browser, every `[data-proof-countdown]` element is re-rendered from
 * its `data-due` (ISO), `data-grace` (ISO) and `data-status` attributes: every
 * 30 s, or every second while any is inside its last hour. Styling lives in
 * `countdown.css`.
 */

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** Grace period after a missed proof deadline (docs/backend.md). */
export const GRACE_MS = 14 * DAY
/** Amber threshold: this long before the deadline or less. */
export const WARN_MS = 3 * DAY

const SLOW_TICK_MS = 30 * SECOND
const FAST_TICK_MS = SECOND

export type CountdownStatus =
	'LIVE' | 'GRACE' | 'FROZEN' | 'DEFAULTED' | 'COMPLETED'
export type CountdownTone = 'neutral' | 'warn' | 'danger'

const pad = (n: number) => String(n).padStart(2, '0')

/** "4d 06h", "5h 12m", "42m 10s". Zero and negative clamp to "0m 00s". */
export function formatCountdown(ms: number) {
	const total = Math.floor(Math.max(0, Number.isFinite(ms) ? ms : 0) / SECOND)
	const d = Math.floor(total / 86_400)
	const h = Math.floor((total % 86_400) / 3600)
	const m = Math.floor((total % 3600) / 60)
	const s = total % 60
	if(d > 0) {
		return `${d}d ${pad(h)}h`
	}

	if(h > 0) {
		return `${h}h ${pad(m)}m`
	}

	return `${m}m ${pad(s)}s`
}

/** Red when overdue (GRACE/FROZEN), amber within 3 days, else neutral. */
export function countdownTone(
	msToDue: number,
	status: CountdownStatus = 'LIVE',
): CountdownTone {
	if(status === 'GRACE' || status === 'FROZEN' || status === 'DEFAULTED') {
		return 'danger'
	}

	return msToDue <= WARN_MS ? 'warn' : 'neutral'
}

export type CountdownInput = {
	dueAt: string | number | Date
	status: CountdownStatus
	graceEndsAt?: string | number | Date | null
	now?: number
}

export type CountdownView = {
	text: string
	tone: CountdownTone
	/** ISO instant the text counts down to (for `<time datetime>`). */
	target: string
	/** True while the text changes every second. */
	fast: boolean
	/** True when the text still changes over time. */
	live: boolean
}

const STATIC = { target: '', fast: false, live: false }

/** Everything the pill shows for an instant, or null with no valid due date. */
export function countdownView(
	{ dueAt, status, graceEndsAt, now = Date.now() }: CountdownInput,
): CountdownView | null {
	if(status === 'DEFAULTED') {
		return { ...STATIC, text: 'Defaulted', tone: 'danger' }
	}

	if(status === 'COMPLETED') {
		return { ...STATIC, text: 'Term complete', tone: 'neutral' }
	}

	const due = new Date(dueAt).getTime()
	if(!Number.isFinite(due)) {
		return null
	}

	if(status === 'GRACE' || status === 'FROZEN') {
		const parsed = graceEndsAt ? new Date(graceEndsAt).getTime() : NaN
		const end = Number.isFinite(parsed) ? parsed : due + GRACE_MS
		const left = end - now
		return {
			text: left > 0
				? `Proof overdue · grace ends in ${formatCountdown(left)}`
				: 'Proof overdue · grace ended',
			tone: 'danger',
			target: new Date(end).toISOString(),
			fast: left > 0 && left <= HOUR,
			live: left > 0,
		}
	}

	const left = due - now
	return {
		text: left <= 0
			? 'Proof due now'
			: left <= HOUR
				? `Due in ${formatCountdown(left)}`
				: `Next proof due in ${formatCountdown(left)}`,
		tone: countdownTone(left, status),
		target: new Date(due).toISOString(),
		fast: left > 0 && left <= HOUR,
		live: left > 0,
	}
}

if(typeof document !== 'undefined') {
	let timer: number | undefined

	const render = () => {
		let fast = false
		const els = document.querySelectorAll<HTMLElement>('[data-proof-countdown]')
		for(const el of els) {
			const due = el.dataset.due
			if(!due) {
				continue
			}

			const view = countdownView({
				dueAt: due,
				status: (el.dataset.status || 'LIVE') as CountdownStatus,
				graceEndsAt: el.dataset.grace,
			})
			if(!view) {
				continue
			}

			const label = el.querySelector('time')
			if(label && label.textContent !== view.text) {
				label.textContent = view.text
			}

			if(el.dataset.tone !== view.tone) {
				el.dataset.tone = view.tone
			}

			fast ||= view.fast
		}

		schedule(fast)
	}

	const schedule = (fast: boolean) => {
		clearTimeout(timer)
		timer = undefined
		if(!document.hidden && document.querySelector('[data-proof-countdown]')) {
			timer = window.setTimeout(render, fast ? FAST_TICK_MS : SLOW_TICK_MS)
		}
	}

	document.addEventListener('htmx:load', render)
	document.addEventListener('htmx:afterSwap', render)
	document.addEventListener('visibilitychange', render)
	if(document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', render)
	} else {
		render()
	}
}
