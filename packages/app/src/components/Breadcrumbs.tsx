import { escapeHtml } from '@kitajs/html'

/** The trail at the top of a page. The last item is the current page. */
export function Breadcrumbs({ items }: {
	items: { label: string, href?: string }[]
}) {
	const last = items.length - 1
	return (
		<nav
			class='rc-breadcrumbs-nav'
			aria-label='Breadcrumb'>
			<ol class='rc-breadcrumbs'>
				{
					items.map((item, i) => (
						<li>
							{
								item.href && i < last
									? (
										<a href={item.href}>
											{escapeHtml(item.label)}
										</a>
									)
									: (
										<span aria-current={i === last ? 'page' : undefined}>
											{escapeHtml(item.label)}
										</span>
									)
							}
						</li>
					))
				}
			</ol>
		</nav>
	)
}
