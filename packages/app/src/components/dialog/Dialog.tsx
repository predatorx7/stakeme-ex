import { type Children, escapeHtml, type PropsWithChildren } from '@kitajs/html'
import { markup } from '../../utils/escape.ts'
import { DialogCloseButton } from './DialogCloseButton.tsx'

/** `sm` is 420px wide, `md` 520px, `lg` 560px, and `xl` a page's width, for
 *  side-by-side cards. `full` fills the viewport, for long editors. */
export type DialogSize = 'sm' | 'md' | 'lg' | 'xl' | 'full'

/**
 * A native `<dialog>` with the shared header, a close button, a body, and an
 * optional footer for the actions. A submit button in the footer targets the
 * body's form with its `form` attribute.
 * Open it from any `<button command='show-modal' commandfor={id}>`;
 * `closedby='any'` closes it on a backdrop click or Escape.
 */
export function Dialog(props: PropsWithChildren<{
	/** Pairs with the trigger's `commandfor` and with HTMX swap targets. */
	id: string
	title: string
	/** One line under the title that says what the dialog does. */
	description?: string
	/** Defaults to `sm`. */
	size?: DialogSize
	/** Render already open, so a link can land on the dialog.
	 *  `client/behaviors.ts` upgrades it to modal after load. */
	open?: boolean
	footer?: Children
}>) {
	const size = props.size || 'sm'
	return (
		<dialog
			id={props.id}
			class='rc-dialog'
			data-size={size === 'lg' ? undefined : size}
			closedby='any'
			open={props.open}>
			<header class='rc-dialog__header'>
				<div>
					<h2>
						{escapeHtml(props.title)}
					</h2>
					{
						!!props.description && (
							<p>
								{escapeHtml(props.description)}
							</p>
						)
					}
				</div>
				<DialogCloseButton dialogId={props.id} />
			</header>
			<div class='rc-dialog__body'>
				{props.children}
			</div>
			{
				props.footer && (
					<footer class='rc-dialog__footer'>
						{markup(props.footer)}
					</footer>
				)
			}
		</dialog>
	)
}
