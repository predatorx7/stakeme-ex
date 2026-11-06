import type { CreatorSummary } from '../types/index.ts'
import { escapeText } from '../utils/escape.ts'

export type TickerItem = Pick<CreatorSummary, 'ticker' | 'price' | 'change24h'>

/** Items per marquee list; the list repeats until it holds this many. */
const MIN_ITEMS = 16

function dirOf(change: number) {
	return change > 0 ? 'up' : change < 0 ? 'down' : 'flat'
}

/** Price with 2 to 4 decimals, so `1.04` and `0.9731` both read well. */
function fmtPrice(price: string) {
	return Number(price).toLocaleString('en-US', {
		minimumFractionDigits: 2,
		maximumFractionDigits: 4,
	})
}

/**
 * Thin quote strip under the header. Server-rendered from `items`;
 * `client/ticker.ts` updates prices from SSE trade events. The list is
 * rendered twice for a seamless CSS marquee, each list repeating the items
 * to span the viewport; repeats are `aria-hidden`.
 * Renders nothing for fewer than 2 creators.
 */
export function TickerStrip({ items }: { items: TickerItem[] }) {
	if(items.length < 2) {
		return null
	}

	// Each list must be wider than the viewport, or the loop shows a gap.
	const passes = Math.ceil(MIN_ITEMS / items.length)

	return (
		<section
			class='smx-ticker'
			aria-label='Live prices'
			data-ticker-strip>
			{
				[false, true].map((copy) => (
					<ul
						class='smx-ticker__list'
						aria-hidden={copy ? 'true' : undefined}>
						{
							Array.from({ length: passes }, (_, pass) => items.map((item) => ({
								item,
								dup: copy || pass > 0,
							}))).flat().map(({ item, dup }) => {
								const change = item.change24h
								const price = Number(item.price)
								// Price 24h ago, so live prices can recompute the change.
								const base = change > -100 ? price / (1 + change / 100) : 0
								return (
									<li aria-hidden={dup ? 'true' : undefined}>
										<a
											href={`/creators/${item.ticker}`}
											tabindex={dup ? -1 : undefined}
											data-dup={dup ? '' : undefined}
											data-ticker-item={item.ticker}
											data-base={String(base)}
											data-dir={dirOf(change)}>
											<span class='smx-ticker__sym'>
												{escapeText(`$${item.ticker}`)}
											</span>
											<span data-ticker-price>
												{escapeText(fmtPrice(item.price))}
											</span>
											<span data-ticker-change>
												{
													escapeText(
														`${change > 0 ? '▲' : change < 0 ? '▼' : ''}${
															change === 0 ? '0.0' : Math.abs(change).toFixed(1)
														}%`,
													)
												}
											</span>
										</a>
									</li>
								)
							})
						}
					</ul>
				))
			}
		</section>
	)
}
