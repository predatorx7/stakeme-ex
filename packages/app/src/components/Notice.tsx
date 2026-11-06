import type { PropsWithChildren } from '@kitajs/html'
import { escapeText } from '../utils/escape.ts'

type NoticeProps = PropsWithChildren<{
	eyebrow: string
	title: string
	/** `data-*` attributes for the page's client script. */
	data?: Record<`data-${string}`, string>
}>

/** A single message centered on the page, with optional actions below it. */
export function Notice({ eyebrow, title, data, children }: NoticeProps) {
	return (
		<main
			class='rc-notice'
			{...data}>
			<section class='rc-card'>
				<p class='rc-eyebrow'>
					{escapeText(eyebrow)}
				</p>
				<h1 safe>
					{title}
				</h1>
				{children}
			</section>
		</main>
	)
}
