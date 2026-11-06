import type { CreatorSummary } from '../../types/index.ts'
import { escapeText } from '../../utils/escape.ts'
import { formatUsdc } from '../../utils/money.ts'
import { Sparkline } from '../charts/Sparkline.tsx'
import { DialogCloseButton } from '../dialog/DialogCloseButton.tsx'
import { PriceChange } from '../PriceChange.tsx'

/** Id of the drawer `<dialog>`; `WatchlistTrigger` opens it by this id. */
export const WATCHLIST_DRAWER_ID = 'watchlist-drawer'

type WatchlistItem = Pick<
	CreatorSummary,
	'ticker' | 'displayName' | 'price' | 'change24h' | 'sparkline'
>

/**
 * A star toggle. `client/watchlist.ts` PUTs or DELETEs `/watchlist/{ticker}`
 * on click, flips `aria-pressed`, shows a toast, and opens the wallet
 * sign-in when the viewer is signed out.
 */
export function WatchlistButton({ ticker, watched }: {
	ticker: string
	watched: boolean
}) {
	return (
		<button
			type='button'
			class='smx-watch'
			data-watchlist-toggle
			data-ticker={ticker}
			aria-pressed={watched ? 'true' : 'false'}
			aria-label={label(ticker, watched)}
			title={watched ? 'Remove from watchlist' : 'Add to watchlist'} />
	)
}

/** Header button that opens the drawer (a native `<dialog>`). */
export function WatchlistTrigger() {
	return (
		<button
			type='button'
			class='rc-button'
			data-size='sm'
			data-watchlist-open
			command='show-modal'
			commandfor={WATCHLIST_DRAWER_ID}
			aria-label='Open watchlist'
			title='Watchlist'>
			<span
				class='smx-watch__star'
				aria-hidden='true' />
			Watchlist
		</button>
	)
}

/**
 * The drawer: a right-side panel on desktop, a full-height sheet below
 * 40rem. Rows are server-rendered from `items`; the client re-fetches
 * `GET /watchlist` each time the drawer opens and rebuilds rows from the
 * `<template>`, so the list never goes stale.
 */
export function WatchlistPanel({ items }: { items: WatchlistItem[] }) {
	return (
		<dialog
			id={WATCHLIST_DRAWER_ID}
			class='smx-watchlist'
			closedby='any'
			aria-labelledby='watchlist-title'>
			<header>
				<h2 id='watchlist-title'>
					Watchlist
				</h2>
				<DialogCloseButton dialogId={WATCHLIST_DRAWER_ID} />
			</header>
			<ul
				class='smx-watchlist__list'
				data-watchlist-list>
				{items.map((item) => <Row item={item} />)}
			</ul>
			<p
				class='smx-watchlist__empty'
				role='status'
				data-watchlist-empty
				hidden={items.length > 0}>
				Star a creator to track it here.
			</p>
			<template data-watchlist-row>
				<Row item={TEMPLATE_ITEM} />
			</template>
		</dialog>
	)
}

const TEMPLATE_ITEM: WatchlistItem = {
	ticker: 'TICK',
	displayName: '',
	price: '0',
	change24h: 0,
	sparkline: [
		{ at: '1970-01-01T00:00:00Z', price: '0' },
		{ at: '1970-01-01T00:00:01Z', price: '1' },
	],
}

function Row({ item }: { item: WatchlistItem }) {
	const path = `/creators/${item.ticker}`
	return (
		<li data-watchlist-item>
			<a
				class='smx-ticker'
				data-wl='ticker'
				href={path}>
				{escapeText(item.ticker)}
			</a>
			<span
				class='smx-watchlist__price'
				data-wl='price'>
				{escapeText(formatUsdc(item.price, 4))}
			</span>
			<PriceChange value={item.change24h} />
			<Sparkline
				points={item.sparkline}
				name={item.ticker} />
			<a
				class='rc-button'
				data-size='sm'
				data-variant='primary'
				data-wl='buy'
				href={`${path}#trade`}>
				Buy
			</a>
			<a
				class='rc-button'
				data-size='sm'
				data-wl='sell'
				href={`${path}#trade`}>
				Sell
			</a>
			<WatchlistButton
				ticker={item.ticker}
				watched />
		</li>
	)
}

function label(ticker: string, watched: boolean) {
	const [verb, prep] = watched ? ['Remove', 'from'] : ['Add', 'to']
	return `${verb} ${ticker} ${prep} watchlist`
}
