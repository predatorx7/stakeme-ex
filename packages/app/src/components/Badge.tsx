import type { PropsWithChildren } from '@kitajs/html'
import type { BadgeTone } from '../utils/tones.ts'

const PILL_TONE = {
	neutral: undefined,
	success: 'verified',
	warn: 'pending',
	danger: 'failed',
	info: 'sandbox',
} as const satisfies Record<BadgeTone, string | undefined>

/**
 * A status pill. `success` is for live and ok, `warn` for pending, `danger`
 * for rejected and blocked, `info` for metadata, and `neutral` (the default)
 * for everything else. The meaning also lives in the label.
 *
 * Children are markup. Wrap dynamic text in `escapeText()`; `xss-scan` (part
 * of `npm run check`) flags a call site that forgets.
 */
export function Badge({ tone = 'neutral', title, children }: PropsWithChildren<{
	tone?: BadgeTone
	/** Native hover tooltip. */
	title?: string
}>) {
	return (
		<span
			class='rc-pill'
			data-tone={PILL_TONE[tone]}
			title={title}>
			{children}
		</span>
	)
}
