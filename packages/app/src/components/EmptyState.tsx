import { escapeHtml, type PropsWithChildren } from '@kitajs/html'

/**
 * "Nothing here yet", rendered where the list or table would be. The children
 * are an optional call to action, usually a button or link.
 */
export function EmptyState({ title, hint, children }: PropsWithChildren<{
	/** What is missing, in the user's words. */
	title: string
	/** How to leave the empty state. */
	hint?: string
}>) {
	return (
		<section
			class='rc-empty-state'
			role='status'>
			<p>
				<strong>
					{escapeHtml(title)}
				</strong>
			</p>
			{
				!!hint && (
					<p>
						{escapeHtml(hint)}
					</p>
				)
			}
			{children}
		</section>
	)
}
