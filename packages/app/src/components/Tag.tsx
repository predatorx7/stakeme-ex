import type { PropsWithChildren } from '@kitajs/html'

/**
 * A free-form tag, such as a provider tag or a verifiable data point. A link
 * when `href` is set, typically a `/providers?tag=…` filter URL. Children are
 * markup; wrap dynamic text in `escapeText()`.
 */
export function Tag({ href, title, children }: PropsWithChildren<{
	href?: string
	/** Native hover tooltip. */
	title?: string
}>) {
	return href ? (
		<a
			class='rc-chip'
			href={href}
			title={title}>
			{children}
		</a>
	) : (
		<span
			class='rc-pill'
			title={title}>
			{children}
		</span>
	)
}
