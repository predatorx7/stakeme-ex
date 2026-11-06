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
