import type { SocialLinks as Links } from '../../types/index.ts'
import { escapeText } from '../../utils/escape.ts'
import { Icon } from '../Icon.tsx'

/** In display order. The design package has no brand icons, so only the
 *  website gets one; the others show their name. */
const NETWORKS = [
	{ key: 'x', label: 'X' },
	{ key: 'github', label: 'GitHub' },
	{ key: 'linkedin', label: 'LinkedIn' },
	{ key: 'website', label: 'Website' },
] as const

/**
 * A creator's profile links as small chips. Renders nothing without links.
 * SQL only stores https URLs on the network's own host; the check here is a
 * second guard so a bad value can never become a `javascript:` href.
 */
export function SocialLinks({ links }: { links?: Links | null }) {
	const items = NETWORKS.flatMap(({ key, label }) => {
		const href = links?.[key]
		return href?.startsWith('https://') ? [{ key, label, href }] : []
	})
	if(!items.length) {
		return ''
	}

	return (
		<ul
			class='smx-social'
			aria-label='Profile links'>
			{
				items.map((l) => (
					<li>
						<a
							class='rc-chip'
							href={l.href}
							target='_blank'
							rel='noopener nofollow'>
							{l.key === 'website' && <Icon name='globe' />}
							{escapeText(l.label)}
						</a>
					</li>
				))
			}
		</ul>
	)
}
