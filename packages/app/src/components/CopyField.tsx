import type { Children } from '@kitajs/html'
import { escapeText, markup } from '../utils/escape.ts'
import { CopyButton } from './CopyButton.tsx'

/**
 * A labeled, read-only value with a Copy button, for credentials such as an
 * org id or an Ethereum address. Values here are not secret; a one-time API
 * token is revealed through `TokenReveal` instead.
 */
export function CopyField({ label, value, hint }: {
	label: string
	value: string
	/** Helper text under the value. */
	hint?: Children
}) {
	return (
		<div class='rc-code-block'>
			<span class='rc-label'>
				{escapeText(label)}
			</span>
			<pre class='rc-code'>
				<code safe>
					{value}
				</code>
			</pre>
			<CopyButton
				text={value}
				aria-label={`Copy ${label}`} />
			{
				hint && (
					<small class='rc-field__hint'>
						{markup(hint)}
					</small>
				)
			}
		</div>
	)
}
