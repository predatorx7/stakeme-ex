import { escapeText } from '../utils/escape.ts'
type Props = {
	/** Copy the text of the element matching this selector. */
	source?: string
	/** Copy this literal text. */
	text?: string
	label?: string
	variant?: 'primary'
	size?: 'sm' | 'md' | 'lg'
	disabled?: boolean
	/** Names the target for assistive technology, for example "Copy token". */
	'aria-label'?: string
}

/** A button the design package's copy behavior wires up. */
export function CopyButton(props: Props) {
	return (
		<button
			type='button'
			class='rc-button'
			data-size={props.size ?? 'sm'}
			data-variant={props.variant}
			aria-label={props['aria-label']}
			disabled={props.disabled}
			data-copy
			data-copy-source={props.source}
			data-copy-text={props.text}>
			<span data-copy-idle>
				{escapeText(props.label ?? 'Copy')}
			</span>
			<span data-copy-done>
				Copied
			</span>
		</button>
	)
}
