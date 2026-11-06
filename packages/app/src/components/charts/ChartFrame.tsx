import type { Children, PropsWithChildren } from '@kitajs/html'
import { escapeText, markup } from '../../utils/escape.ts'

/** A titled card around one chart; `kind` picks the body height. */
export function ChartFrame({ title, meta, kind, children }: PropsWithChildren<{
	title: string
	/** Short text or small markup, such as a legend, at the end of the header. */
	meta?: Children
	kind?: 'area' | 'funnel'
}>) {
	return (
		<section
			class='rc-chart-frame'
			data-tile>
			<header class='rc-chart-frame__header'>
				<h2>
					{escapeText(title)}
				</h2>
				{
					meta && (
						<span>
							{markup(meta)}
						</span>
					)
				}
			</header>
			<div
				class='rc-chart-frame__body'
				data-kind={kind}>
				{children}
			</div>
		</section>
	)
}
