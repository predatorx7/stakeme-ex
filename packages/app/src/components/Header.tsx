import { escapeHtml } from '@kitajs/html'
import { APP_NAME, BASE_PATH } from '../consts.ts'
import { shortHex } from '../utils/money.ts'
import { Avatar } from './Avatar.tsx'
import { Icon, type IconName } from './Icon.tsx'
import { navLink } from './nav-swap.ts'
import { KeyExportDialog, WalletConnectDialog } from './WalletDialogs.tsx'

/** The primary tab a page belongs to, set through `Layout`'s `nav` prop. */
export type NavKey = 'exchange' | 'creators' | 'activity' | 'hub' | 'launch'

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
		key: 'creators',
		label: 'Creators',
		href: `${BASE_PATH}creators`,
		icon: 'users',
	},
	{
		key: 'activity',
		label: 'Activity',
		href: `${BASE_PATH}activity`,
		icon: 'activity',
	},
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

type Viewer = {
	name: string
	email: string
	walletAddress?: string | null
}

type HeaderProps = {
	/** The signed-in viewer. Anonymous visitors get a Connect wallet button. */
	viewer?: Viewer | null
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
					{...navLink(BASE_PATH)}>
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
						data-dw-sparkle
						{...linkProps(NAV_ITEMS.find((item) => item.key === 'launch')!)}>
						Launch your IPO
					</a>
					{
						viewer ? (
							<ProfileMenu viewer={viewer} />
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
			{!viewer && <WalletConnectDialog />}
			<KeyExportDialog />
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

/**
 * Signed-in wallet as a design-system profile menu: the trigger shows the
 * short address, the menu holds the wallet kind and the account actions.
 * `client/wallet.ts` paints `[data-wallet-kind]` and reveals Export key for a
 * key held in this browser.
 */
function ProfileMenu({ viewer }: { viewer: Viewer }) {
	const address = viewer.walletAddress
	const short = address ? shortHex(address) : viewer.name
	return (
		<>
			<button
				type='button'
				class='rc-profile-menu__trigger'
				popovertarget='profile-menu'
				aria-label='Open profile menu'
				aria-haspopup='menu'>
				<Avatar
					seed={address}
					initials={address ? undefined : 'ME'}
					size='sm' />
				<strong
					class='smx-mono'
					data-wallet-address
					title={address ?? undefined}>
					{escapeHtml(short)}
				</strong>
				<span
					class='rc-profile-menu__chevron'
					aria-hidden='true'>
					<Icon name='chevronDown' />
				</span>
			</button>
			<div
				id='profile-menu'
				class='rc-profile-menu smx-dw-hairline'
				role='menu'
				popover>
				<div class='rc-profile-menu__identity'>
					<Avatar
						seed={address}
						initials={address ? undefined : 'ME'} />
					<strong
						class='smx-mono'
						data-wallet-address
						title={address ?? undefined}>
						{escapeHtml(short)}
					</strong>
					<small data-wallet-kind>
						Wallet
					</small>
				</div>
				<div class='rc-profile-menu__actions'>
					<button
						type='button'
						role='menuitem'
						data-key-export='evm'
						hidden>
						<Icon name='shieldCheck' />
						Export key
					</button>
					<button
						type='button'
						role='menuitem'
						class='rc-profile-menu__action--danger'
						data-wallet-signout>
						<Icon name='logout' />
						Sign out
					</button>
				</div>
			</div>
		</>
	)
}
