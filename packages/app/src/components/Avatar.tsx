import { escapeHtml } from '@kitajs/html'

type Props = {
	/** Image URL. Without one, the avatar shows the initial of `fallbackFor`. */
	src?: string | null
	/** Name the initial comes from; `?` when blank. */
	fallbackFor?: string | null
	/** Letters to show instead of the initial of `fallbackFor`. */
	initials?: string
	alt?: string
	/** Omit for the standard 28px avatar. */
	size?: 'sm' | 'lg'
	/** `outline` is hollow and `pending` is dashed. Solid by default. */
	tone?: 'outline' | 'pending'
	/** Round by default. */
	shape?: 'square'
	/** Extra class for layout, such as grid placement. */
	class?: string
}

/**
 * An image or initial in a `rc-avatar`. Decorative: the surrounding link or
 * row carries the accessible name.
 */
export function Avatar(props: Props) {
	const initial = props.initials
		|| (props.fallbackFor || '?').trim().slice(0, 1).toUpperCase()
	return (
		<span
			class={`rc-avatar${props.class ? ` ${props.class}` : ''}`}
			data-size={props.size}
			data-shape={props.shape}
			data-tone={props.tone}
			aria-hidden='true'>
			{
				props.src ? (
					<img
						src={props.src}
						alt={escapeHtml(props.alt || '')}
						loading='lazy' />
				) : (
					escapeHtml(initial)
				)
			}
		</span>
	)
}
