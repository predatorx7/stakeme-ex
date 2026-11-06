import { escapeText } from '../utils/escape.ts'

/** Whole-unit remaining time as `12d 04h 31m`. Browsers tick it every second
 *  (`client/live.ts`); the server value is the first paint. */
export function formatRemaining(ms: number) {
	if(ms <= 0) {
		return 'Overdue'
	}

	const s = Math.floor(ms / 1000)
	const d = Math.floor(s / 86400)
	const h = Math.floor(s % 86400 / 3600)
	const m = Math.floor(s % 3600 / 60)
	const pad = (n: number) => String(n).padStart(2, '0')
	return d > 0
		? `${d}d ${pad(h)}h ${pad(m)}m`
		: `${pad(h)}h ${pad(m)}m ${pad(s % 60)}s`
}

/** A live countdown to `until` (ISO timestamp). */
export function Countdown({ until, now = Date.now() }: {
	until: string
	now?: number
}) {
	return (
		<time
			class='smx-countdown'
			datetime={until}
			data-countdown={until}>
			{escapeText(formatRemaining(Date.parse(until) - now))}
		</time>
	)
}
