/**
 * Short date — "May 19, 2026". Accepts a `Date`, an ISO string, or
 * `null`/`undefined` (returns an em-dash). Used in detail headers, list rows,
 * and other "human-eye" surfaces.
 *
 * Always UTC, matching the API and the logs. These pages are rendered on the
 * SERVER, so without `timeZone` the container's clock would decide which
 * calendar day a timestamp falls on — `2026-07-26T20:00:00Z` reads as Jul 26 in
 * UTC and Jul 27 in Karachi. One dashboard, one clock, whatever the deployment
 * sets TZ to.
 */
export function formatDate(value: Date | string | null | undefined) {
	if(!value) {
		return '—'
	}

	try {
		const d = value instanceof Date ? value : new Date(value)
		return d.toLocaleDateString('en-US', SHORT_DATE)
	} catch{
		return String(value)
	}
}

const SHORT_DATE: Intl.DateTimeFormatOptions = {
	year: 'numeric',
	month: 'short',
	day: 'numeric',
	timeZone: 'UTC',
}
