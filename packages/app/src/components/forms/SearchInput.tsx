import { escapeHtml } from '@kitajs/html'
import { Icon } from '../Icon.tsx'

type SearchInputProps = JSX.HtmlInputTag & {
	/** Attributes for the wrapping `<label>`, usually HTMX wiring such as
	 *  `hx-get` and `hx-target` so typing fires a request. */
	containerProps?: JSX.HtmlLabelTag
	/** The taller field used at the top of a page. */
	large?: boolean
	/** A note at the end of the field, such as "8 providers". */
	count?: string
}

/** A search field with the shared icon and focus ring. Standard `<input>`
 *  props pass through. */
export function SearchInput(
	{ containerProps, large, count, ...props }: SearchInputProps,
) {
	return (
		<label
			{...containerProps}
			class={`rc-search ${containerProps?.class || ''}`.trim()}
			data-size={large ? 'lg' : undefined}>
			<Icon name='search' />
			<input
				{...props}
				type='search' />
			{
				!!count && (
					<span class='rc-search__count'>
						{escapeHtml(count)}
					</span>
				)
			}
		</label>
	)
}
