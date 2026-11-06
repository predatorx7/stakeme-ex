export type Tone = 'primary' | 'danger' | 'muted'

/** One stacked part of a bar. */
export type Segment = { name: string, value: number, tone: Tone }

export const OUTCOMES = [
	{ key: 'succeeded', tone: 'primary' },
	{ key: 'failed', tone: 'danger' },
	{ key: 'pending', tone: 'muted' },
] as const

/** Succeeded, failed and pending counts of an outcomes row. */
export function outcomeSegments(
	row: { succeeded: number, failed: number, pending: number },
): Segment[] {
	return OUTCOMES.map(({ key, tone }) => ({
		name: key,
		tone,
		value: row[key],
	}))
}

export function segmentsTitle(label: string, segments: Segment[]) {
	const counts = segments
		.map(({ name, value }) => `${value.toLocaleString('en-US')} ${name}`)
	return `${label}: ${counts.join(', ')}`
}

export function total(segments: Segment[]) {
	return segments.reduce((sum, { value }) => sum + value, 0)
}
