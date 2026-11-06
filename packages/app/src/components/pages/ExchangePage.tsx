import type { Exchange } from '../../types/index.ts'
import { escapeText } from '../../utils/escape.ts'
import { formatUsdc } from '../../utils/money.ts'
import { Badge } from '../Badge.tsx'
import { EmptyState } from '../EmptyState.tsx'
import { OracleEventItem } from '../events/OracleEventItem.tsx'
import { PageHeader } from '../PageHeader.tsx'
import { SectionCard } from '../SectionCard.tsx'

/**
 * Exchange home. Placeholder markup: workstream 6 builds the trending grid,
 * sparklines and the live feed. Props are the `Exchange` JSON document.
 */
export function ExchangePage({ exchange }: { exchange: Exchange }) {
	return (
		<>
			<PageHeader
				eyebrow='Exchange'
				title='Trending creators' />
			<SectionCard
				title='Creators'
				count={exchange.trending.length}>
				{
					exchange.trending.length === 0
						? (
							<EmptyState
								title='No creators yet'
								hint='Launch the first IPO.' />
						)
						: (
							<ul>
								{
									exchange.trending.map((c) => (
										<li>
											<a href={`/creators/${c.ticker}`}>
												{escapeText(`$${c.ticker}`)}
											</a>
											{' '}
											{escapeText(c.displayName)}
											{' '}
											{escapeText(formatUsdc(c.price, 4))}
											{' '}
											<Badge tone={c.change24h < 0 ? 'danger' : 'success'}>
												{escapeText(`${c.change24h}%`)}
											</Badge>
										</li>
									))
								}
							</ul>
						)
				}
			</SectionCard>
			<SectionCard title='Live oracle events'>
				{/* htmx-sse swaps each `oracle-event` HTML fragment in on top. */}
				<ul
					hx-ext='sse'
					{...{ 'sse-connect': '/events', 'sse-swap': 'oracle-event' }}
					hx-swap='afterbegin'>
					{exchange.events.map((e) => <OracleEventItem event={e} />)}
				</ul>
			</SectionCard>
		</>
	)
}
