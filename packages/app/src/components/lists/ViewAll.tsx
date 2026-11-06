import { escapeHtml } from '@kitajs/html'
import { navLink } from '../nav-swap.ts'

/**
 * The "View all" link in a widget's card header, shown only when the full page
 * holds more rows than the widget (a `hasMore` flag from the page document).
 */
export function ViewAll({ href, label }: { href: string, label: string }) {
	return (
		<a
			class='rc-button'
			data-size='sm'
			aria-label={escapeHtml(`View all ${label}`)}
			{...navLink(href)}>
			View all
		</a>
	)
}
