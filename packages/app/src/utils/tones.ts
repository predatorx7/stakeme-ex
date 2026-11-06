/**
 * The Badge palette, plus the status → tone mappings that share it. One source
 * so every page colours the same state the same way.
 */

export type BadgeTone = 'neutral' | 'success' | 'warn' | 'danger' | 'info'

/** Tone for a generic status string. Domain code adds its own mappings. */
export function statusTone(status: string): BadgeTone {
	switch (status) {
		case 'success':
		case 'ACTIVE':
			return 'success'
		case 'rejected':
		case 'error':
			return 'danger'
		case 'expired':
			return 'warn'
		default:
			return 'info'
	}
}
