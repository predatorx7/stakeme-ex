import { escapeHtml } from '@kitajs/html'
import { APP_NAME, BASE_PATH } from '../consts.ts'
import { shortHex } from '../utils/money.ts'
import { Avatar } from './Avatar.tsx'
import { Icon, type IconName } from './Icon.tsx'
import { navLink } from './nav-swap.ts'

/** The primary tab a page belongs to, set through `Layout`'s `nav` prop. */
export type NavKey = 'exchange' | 'hub' | 'launch'

type NavItem = {
	key: NavKey
	label: string
	href: string
	icon: IconName
	/** Anonymous visitors sign in first, then land on the page. */
	auth?: boolean
}

const NAV_ITEMS: NavItem[] = [
	{ key: 'exchange', label: 'Exchange', href: BASE_PATH, icon: 'barChart' },
	{
		key: 'hub',
		label: 'Hub',
		href: `${BASE_PATH}hub`,
		icon: 'shieldCheck',
		auth: true,
	},
	{
		key: 'launch',
		label: 'Launch',
		href: `${BASE_PATH}launch`,
		icon: 'plus',
		auth: true,
	},
]

type HeaderProps = {
	/** The signed-in viewer. Anonymous visitors get a Connect wallet button. */
	viewer?: {
		name: string
		email: string
		walletAddress?: string | null
	} | null
	nav?: NavKey
}

/**
 * The site header and, below 900px, the bottom tab bar. Every link keeps a
 * real `href`, so it works for browsers and bots; `navLink` upgrades the
 * clicks to shell swaps. For an anonymous visitor the member-only links open
 * the wallet sign-in and then continue to the page.
 */
export function Header({ viewer, nav }: HeaderProps) {
	const current = (key: NavKey) => (nav === key ? 'page' : undefined)
	const linkProps = (item: NavItem) => item.auth && !viewer
		? {
			href: item.href,
			'data-wallet-connect': '',
			'data-wallet-redirect': item.href,
		}
		: navLink(item.href)
	return (
		<>
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
						{escapeHtml(`${APP_NAME} (SMX)`)}
					</span>
				</a>
				<nav
					class='rc-app-bar__nav'
					aria-label='Primary'>
					{
						NAV_ITEMS.map((item) => (
							<a
								class='rc-nav-link'
								aria-current={current(item.key)}
								{...linkProps(item)}>
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
						data-hide-compact
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
					<a
						class='rc-button'
						data-variant='primary'
						data-hide-compact
						{...linkProps(NAV_ITEMS[2])}>
						Launch your IPO
					</a>
					{
						viewer ? (
							<span
								class='rc-person'
								title={viewer.email}>
								<Avatar
									fallbackFor={viewer.name}
									size='sm' />
								<span
									class='smx-mono'
									data-wallet-address
									title={viewer.walletAddress ?? undefined}>
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
							<button
								type='button'
								class='rc-button'
								data-wallet-connect>
								Connect wallet
							</button>
						)
					}
				</div>
			</header>
			<nav
				class='rc-bottom-tabs'
				aria-label='Primary mobile'>
				{
					NAV_ITEMS.map((item) => (
						<a
							class='rc-nav-link'
							aria-current={current(item.key)}
							{...linkProps(item)}>
							<Icon name={item.icon} />
							<span>
								{escapeHtml(item.label)}
							</span>
						</a>
					))
				}
			</nav>
		</>
	)
}
