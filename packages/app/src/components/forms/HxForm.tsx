import type { PropsWithChildren } from '@kitajs/html'

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete'

type HxFormProps = PropsWithChildren<{
	/** HTTP method. Defaults to POST. */
	method?: Method
	/** Submit URL. */
	action: string
	/** CSS selector for the error output. Defaults to `find .form-error`. */
	errorTarget?: string
	/** CSS selector for a successful response to swap into (`hx-target`). */
	target?: string
	/** Swap strategy for `target` (`hx-swap`), for example, `outerHTML`. */
	swap?: string
	/** Encoding override (for example, multipart). */
	encoding?: 'multipart/form-data'
	/** Confirmation prompt before submission. */
	confirm?: string
	/** Extra HTMX extension(s) to enable alongside `response-targets`. */
	ext?: string
	id?: string
	class?: string
}>

/**
 * Standard HTMX form wrapper. Pre-wires the response-targets extension
 * to surface 4xx/422/409 problem bodies into the form's inline
 * `<FormError />`. Use a regular `<form>` if you don't want HTMX.
 */
export function HxForm(props: HxFormProps) {
	const method = props.method || 'post'
	const target = props.errorTarget || 'find .form-error'
	const hxProps = {
		[`hx-${method}`]: props.action,
		'hx-ext': props.ext ? `response-targets, ${props.ext}` : 'response-targets',
		'hx-target': props.target,
		'hx-swap': props.swap,
		'hx-target-error': target,
		'hx-target-422': target,
		'hx-target-409': target,
		'hx-encoding': props.encoding,
		'hx-confirm': props.confirm,
	}
	return (
		<form
			id={props.id}
			class={`hx-form${props.class ? ' ' + props.class : ''}`}
			{
				// HTMX attributes are not in KitaJS's HtmlFormTag; the
				// `typed-htmx` package adds them globally for static
				// known names, but dynamic `hx-<method>` doesn't satisfy
				// the strict shape. The HTML output is still well-typed.
				...hxProps
			}
		>
			{props.children}
		</form>
	)
}
