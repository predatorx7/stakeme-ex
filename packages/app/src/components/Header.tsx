import { escapeHtml } from '@kitajs/html'
import { APP_NAME, BASE_PATH } from '../consts.ts'
import { shortHex } from '../utils/money.ts'
import { Avatar } from './Avatar.tsx'
import { Icon } from './Icon.tsx'
import { navLink } from './nav-swap.ts'

/** The primary tab a page belongs to, set through `Layout`'s `nav` prop.
 *  Domain pages extend this union and the `NAV_ITEMS` list below. */
export type NavKey = 'exchange' | 'hub' | 'launch'

type NavItem = { key: NavKey, label: string, href: string, auth?: boolean }

/** Primary navigation. Items with `auth` show only to signed-in viewers. */
const NAV_ITEMS: NavItem[] = [
	{ key: 'exchange', label: 'Exchange', href: BASE_PATH },
	{ key: 'hub', label: 'Creator hub', href: `${BASE_PATH}hub`, auth: true },
	{ key: 'launch', label: 'Launch IPO', href: `${BASE_PATH}launch` },
]

type HeaderProps = {
	/** The signed-in viewer. Anonymous visitors get a Connect wallet link. */
	viewer?: {
		name: string
		email: string
		walletAddress?: string | null
	} | null
	nav?: NavKey
}

/**
 * The site header. Every link keeps a real `href`, so it works for browsers
 * and bots; `navLink` upgrades the clicks to shell swaps.
 */
export function Header({ viewer, nav }: HeaderProps) {
	const current = (key: NavKey) => (nav === key ? 'page' : undefined)
	return (
		<header
			class='rc-app-bar'
			data-sticky>
			<a
				class='rc-app-bar__brand'
				{...navLink(BASE_PATH)}
				aria-label={`${APP_NAME} home`}>
				<span
					class='smx-brand-mark'
					aria-hidden='true'>
					SMX
				</span>
				<span class='smx-wordmark'>
					SMX
				</span>
			</a>
			<nav
				class='rc-app-bar__nav'
				aria-label='Primary'>
				{
					NAV_ITEMS
						.filter((item) => !item.auth || !!viewer)
						.map((item) => (
							<a
								class='rc-nav-link'
								aria-current={current(item.key)}
								{...navLink(item.href)}>
								{escapeHtml(item.label)}
							</a>
						))
				}
			</nav>
			<div class='rc-app-bar__actions'>
				<button
					type='button'
					class='rc-button'
					data-size='sm'
					data-icon-only
					data-theme-toggle
					aria-pressed='false'
					aria-label='Dark theme'
					title='Toggle dark theme'>
					<span data-theme-icon='moon'>
						<Icon name='moon' />
					</span>
					<span data-theme-icon='sun'>
						<Icon name='sun' />
					</span>
				</button>
				{
					viewer ? (
						<span
							class='rc-person'
							title={viewer.email}>
							<Avatar
								fallbackFor={viewer.name}
								size='sm' />
							<span>
								{
									escapeHtml(
										viewer.walletAddress
											? shortHex(viewer.walletAddress)
											: viewer.name,
									)
								}
							</span>
						</span>
					) : (
						<a
							class='rc-button'
							data-variant='inline'
							href={`${BASE_PATH}login`}>
							Connect wallet
						</a>
					)
				}
			</div>
		</header>
	)
}
