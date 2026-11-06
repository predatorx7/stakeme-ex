import { escapeHtml } from '@kitajs/html'
import { gravatarUrl } from '../utils/gravatar.ts'

type Props = {
	/** Image URL. Takes precedence over `seed`. */
	src?: string | null
	/**
	 * Stable id (never a wallet address) to derive a generated Gravatar from.
	 * The browser requests the image from gravatar.com, which only receives the
	 * SHA-256 of the seed. The initials sit behind it as the fallback.
	 */
	seed?: string | null
	/** Name the initial comes from; `?` when blank. */
	fallbackFor?: string | null
	/** Letters to show instead of the initial of `fallbackFor`. */
	initials?: string
	alt?: string
	/** Omit for the standard 24px avatar. */
	size?: 'sm' | 'lg'
	/** `outline` is hollow and `pending` is dashed. Solid by default. */
	tone?: 'outline' | 'pending'
	/** Round by default. */
	shape?: 'square'
	/** Extra class for layout, such as grid placement. */
	class?: string
	/** Marks the origin of the coin trail (`client/coin-trail.ts`). */
	coinSource?: boolean
}

const PX = { sm: 22, lg: 56 } as const

/**
 * An image or initial in a `rc-avatar`. Decorative: the surrounding link or
 * row carries the accessible name.
 */
export function Avatar(props: Props) {
	const initial = props.initials
		|| (props.fallbackFor
			? props.fallbackFor.trim().slice(0, 1)
			: props.seed ? props.seed.replace(/^0x/i, '').slice(0, 2) : '?'
		).toUpperCase() || '?'
	const px = props.size ? PX[props.size] : 24
	const src = props.src || (props.seed ? gravatarUrl(props.seed, px) : null)
	return (
		<span
			class={`rc-avatar${props.class ? ` ${props.class}` : ''}`}
			data-size={props.size}
			data-shape={props.shape}
			data-tone={props.tone}
			data-image={src ? '' : undefined}
			data-coin-source={props.coinSource ? '' : undefined}
			aria-hidden='true'>
			{escapeHtml(initial)}
			{
				!!src && (
					<img
						src={escapeHtml(src)}
						alt={escapeHtml(props.alt || '')}
						width={px}
						height={px}
						loading='lazy'
						decoding='async'
						{...{ referrerpolicy: 'no-referrer' }} />
				)
			}
		</span>
	)
}
