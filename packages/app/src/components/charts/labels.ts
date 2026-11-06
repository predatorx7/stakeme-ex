/** `2026-10-14` as `Oct 14`. */
export function dayLabel(day: string) {
	return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		timeZone: 'UTC',
	})
}

/** The first, middle and last of `labels`, for a sparse axis. */
export function axisLabels(labels: string[]) {
	const middle = labels[Math.floor(labels.length / 2)]
	return [...new Set([labels[0], middle, labels.at(-1)])]
		.filter((label) => label !== undefined)
}

/** One UTC day as the sessions list's `createdAfter`/`createdBefore`. */
export function dayRange(day: string) {
	const start = new Date(`${day}T00:00:00Z`)
	return {
		createdAfter: start.toISOString(),
		createdBefore: new Date(start.getTime() + 86_400_000).toISOString(),
	}
}

const CLOCK = new Intl.DateTimeFormat('en-US', {
	hour: '2-digit',
	minute: '2-digit',
	hourCycle: 'h23',
	timeZone: 'UTC',
})
const DAY_CLOCK = new Intl.DateTimeFormat('en-US', {
	month: 'short',
	day: 'numeric',
	hour: '2-digit',
	minute: '2-digit',
	hourCycle: 'h23',
	timeZone: 'UTC',
})
const DAY = new Intl.DateTimeFormat('en-US', {
	month: 'short',
	day: 'numeric',
	timeZone: 'UTC',
})

/** Time axis for a chart range: first, middle and last candle, labelled to
 *  the range (`1H` clock, `1D` day and clock, else day), in UTC. */
export function timeAxis(times: number[], interval?: string) {
	const fmt = interval === '1H'
		? CLOCK
		: interval === '1D' ? DAY_CLOCK : DAY
	const picks = [times[0], times[Math.floor(times.length / 2)], times.at(-1)]
	return [...new Set(picks.filter((t) => t !== undefined).map((t) => fmt.format(t)))]
}
