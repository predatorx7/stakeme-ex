import { escapeHtml } from '@kitajs/html'

/**
 * Placeholder for an htmx fragment that is still loading. Decorative: the
 * wrapper carries `aria-busy` and one visually hidden status line.
 */
export function Skeleton({ lines = 3, height = '1rem', label = 'Loading' }: {
	/** Number of bars. */
	lines?: number
	/** CSS height of each bar, or of the block when `lines` is 1. */
	height?: string
	/** Text for screen readers. */
	label?: string
}) {
	return (
		<div
			class='smx-skeleton'
			aria-busy='true'
			role='status'>
			<span class='smx-sr-only'>
				{escapeHtml(label)}
			</span>
			{
				Array.from({ length: Math.max(1, lines) }, () => (
					<span
						class='smx-skeleton__bar'
						aria-hidden='true'
						style={escapeHtml(`height:${height}`)} />
				))
			}
		</div>
	)
}
