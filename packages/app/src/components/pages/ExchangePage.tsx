import type { Exchange } from '../../types/index.ts'
import { escapeText } from '../../utils/escape.ts'
import { formatUsdc } from '../../utils/money.ts'
import { PriceChart } from '../charts/PriceChart.tsx'
import { Sparkline } from '../charts/Sparkline.tsx'
import { CreatorStatusBadge, isEscrowFrozen } from '../CreatorStatus.tsx'
import { DataTable } from '../DataTable.tsx'
import { EmptyState } from '../EmptyState.tsx'
import { OracleEventItem } from '../events/OracleEventItem.tsx'
import { Kpi } from '../Kpi.tsx'
import { PageHeader } from '../PageHeader.tsx'
import { PriceChange } from '../PriceChange.tsx'
import { SectionCard } from '../SectionCard.tsx'

/**
 * Exchange home: headline numbers, trending humans, the top creator's price
 * chart and the live oracle feed. The market region reloads on oracle events
 * (`smx:oracle-event`, fired by `client/live.ts`); the feed itself is outside
 * it so its SSE connection survives the reload.
 */
export function ExchangePage({ exchange }: { exchange: Exchange }) {
	const { trending, events, totals } = exchange
	const top = trending[0]
	return (
		<>
			<div
				id='exchange-live'
				class='smx-page smx-xc'
				hx-get='/'
				hx-trigger='smx:oracle-event from:body delay:1s'
				hx-select='#exchange-live'
				hx-swap='outerHTML'>
				<PageHeader
					eyebrow='Exchange'
					title='StakeMe Exchange (SMX)' />
				<div class='rc-kpi-grid smx-xc-kpis'>
					<Kpi
						label='Total raised'
						value={formatUsdc(totals.totalRaised)}
						note={`holders: ${totals.holders}`} />
					<Kpi
						label='Active creators'
						value={String(totals.activeCreators)}
						note='live or in grace period' />
					<Kpi
						label='Dividends paid'
						value={formatUsdc(totals.dividendsPaid)}
						note='to holders, all time' />
				</div>
				<SectionCard
					title='Trending humans'
					count={trending.length}>
					{
						trending.length === 0
							? (
								<EmptyState
									title='No creators yet'
									hint='Launch the first IPO to open the market.'>
									<a
										class='rc-button'
										data-variant='primary'
										href='/launch'>
										Launch your IPO
									</a>
								</EmptyState>
							)
							: (
								<DataTable
									caption='Trending creators'
									columns={
										[
											{ label: 'Creator' },
											{ label: 'Price', align: 'end' },
											{ label: '24h', align: 'end' },
											{ label: 'Trend', col: 'spark' },
											{ label: 'Status', col: 'status' },
											{ label: 'Actions', align: 'end' },
										]
									}>
									{
										trending.map((c, i) => (
											<tr
												class='smx-trending'
												data-rank={i === 0 ? '1' : undefined}>
												<td>
													<a
														class='smx-who'
														href={`/creators/${c.ticker}`}>
														<span>
															<strong class='smx-ticker'>
																{escapeText(`$${c.ticker}`)}
															</strong>
															<small>
																{escapeText(`${c.displayName}, ${c.headline}`)}
															</small>
														</span>
													</a>
												</td>
												<td data-align='end'>
													{escapeText(formatUsdc(c.price, 4))}
												</td>
												<td data-align='end'>
													<PriceChange value={c.change24h} />
												</td>
												<td data-col='spark'>
													<Sparkline
														points={c.sparkline}
														name={c.ticker} />
												</td>
												<td data-col='status'>
													<CreatorStatusBadge
														status={c.status}
														frozen={isEscrowFrozen(c.status)} />
												</td>
												<td data-align='end'>
													<div class='smx-row-actions'>
														{
															c.status === 'DEFAULTED'
																? (
																	<a
																		class='rc-button'
																		data-size='sm'
																		href={`/creators/${c.ticker}`}>
																		View
																	</a>
																)
																: (
																	<>
																		<a
																			class='rc-button'
																			data-size='sm'
																			data-variant='primary'
																			data-dw-sparkle
																			href={`/creators/${c.ticker}#trade`}
																			aria-label={`Buy ${c.ticker}`}>
																			Buy
																		</a>
																		<a
																			class='rc-button smx-sell'
																			data-size='sm'
																			href={`/creators/${c.ticker}#trade`}
																			aria-label={`Sell ${c.ticker}`}>
																			Sell
																		</a>
																	</>
																)
														}
													</div>
												</td>
											</tr>
										))
									}
								</DataTable>
							)
					}
				</SectionCard>
				{
					!!top && top.sparkline.length > 1 && (
						<PriceChart
							title={`$${top.ticker} price, top creator`}
							name={`${top.displayName} price history`}
							points={top.sparkline} />
					)
				}
			</div>
			<div class='smx-page smx-xc-feed'>
				<SectionCard
					title='Live oracle events'
					context='Updates as the 0G agent audits proofs and creators trade.'>
					<ul
						class='smx-feed'
						aria-live='polite'
						hx-ext='sse'
						{...{ 'sse-connect': '/events', 'sse-swap': 'oracle-event' }}
						hx-swap='afterbegin'>
						{events.map((e) => <OracleEventItem event={e} />)}
					</ul>
				</SectionCard>
			</div>
		</>
	)
}
