/* eslint-disable @stylistic/max-len -- deeply nested JSX copy */
import type { CreatorPage as CreatorPageData } from '../../types/index.ts'
import { formatDate } from '../../utils/dates.ts'
import { escapeText } from '../../utils/escape.ts'
import { holderAvatarSeed } from '../../utils/gravatar.ts'
import { formatTokens, formatUsdc, shortHex } from '../../utils/money.ts'
import { Avatar } from '../Avatar.tsx'
import { Badge } from '../Badge.tsx'
import { BlockingWarning } from '../BlockingWarning.tsx'
import { PendingChainBadge } from '../ChainJobBadge.tsx'
import { CreatorUpdates } from '../creator/CreatorUpdates.tsx'
import { SocialLinks } from '../creator/SocialLinks.tsx'
import { isEscrowFrozen } from '../CreatorStatus.tsx'
import { DataTable } from '../DataTable.tsx'
import { EmptyState } from '../EmptyState.tsx'
import { OracleEventItem } from '../events/OracleEventItem.tsx'
import { Field } from '../forms/Field.tsx'
import { FormError } from '../forms/FormError.tsx'
import { HxForm } from '../forms/HxForm.tsx'
import { CorporateActions } from '../instrument/CorporateActions.tsx'
import { EscrowMeter } from '../instrument/EscrowMeter.tsx'
import { Fundamentals } from '../instrument/Fundamentals.tsx'
import { InstrumentStats } from '../instrument/InstrumentStats.tsx'
import { MarketDepth } from '../instrument/MarketDepth.tsx'
import { OrderTicket } from '../instrument/OrderTicket.tsx'
import { PositionBox } from '../instrument/PositionBox.tsx'
import { pickTranche, ProofPipeline } from '../instrument/ProofPipeline.tsx'
import { WatchlistButton } from '../instrument/Watchlist.tsx'
import { Kpi } from '../Kpi.tsx'
import { ViewAll } from '../lists/ViewAll.tsx'
import { PageHeader } from '../PageHeader.tsx'
import { ProofAudit } from '../ProofAudit.tsx'
import { SectionCard } from '../SectionCard.tsx'
import { Skeleton } from '../Skeleton.tsx'
import { HashRef, StorageRef, TxLink } from '../TxLink.tsx'

const TRANCHE_TONE = {
	LOCKED: 'warn',
	RELEASED: 'success',
	REFUNDED: 'info',
} as const

const PROOF_TONE = {
	PENDING: 'warn',
	APPROVED: 'success',
	REJECTED: 'danger',
} as const

/**
 * Token page. The market region (price, chart, terms, escrow, holders, proofs)
 * reloads after a trade, investment or oracle event. The forms and the event
 * feed sit outside it, so typing and the SSE connection are not interrupted.
 */
export function CreatorPage({ page }: { page: CreatorPageData }) {
	const c = page.creator
	const path = `/creators/${c.ticker}`
	const frozen = isEscrowFrozen(c.status, page.events)
	const raised = Number(c.raised)
	const target = Number(c.targetRaise)
	const open = c.status === 'LIVE' && raised < target
	const signedIn = !!page.viewer.wallet
	const { market } = page
	const raising = market.status.kind === 'LIVE' && market.status.tradingHalted
	const refresh = 'smx:traded from:body, smx:invested from:body, '
		+ 'smx:dividend-paid from:body, smx:oracle-event from:body delay:1s'
	return (
		<div class='smx-layout'>
			<div class='smx-creator-main'>
				<div
					id='creator-top'
					class='smx-page'
					hx-get={path}
					hx-trigger={refresh}
					hx-select='#creator-top'
					hx-swap='outerHTML'>
					<PageHeader
						eyebrow={`$${c.ticker}`}
						title={c.displayName}
						avatar={c.id}
						coinSource
						lede={c.headline}
						meta={
							<>
								{
									signedIn && (
										<WatchlistButton
											ticker={c.ticker}
											watched={false} />
									)
								}
								<SocialLinks links={c.socialLinks} />
								<PendingChainBadge
									creatorId={c.id}
									pending={c.chain.pendingJobs} />
							</>
						} />
					{
						c.status === 'DEFAULTED' && (
							<BlockingWarning
								title='Defaulted: escrow refunded, stake slashed'>
								The creator's World ID is banned. Trading and new investments are closed.
							</BlockingWarning>
						)
					}
					{
						frozen && c.status !== 'DEFAULTED' && (
							<BlockingWarning title='Escrow frozen: income proof overdue'>
								{
									c.graceUntil
										? 'Tranches are paused until a proof is submitted. '
											+ `Escrow is refunded if none arrives by ${formatDate(c.graceUntil)}.`
										: 'Tranches are paused until a proof is submitted.'
								}
							</BlockingWarning>
						)
					}
					<InstrumentStats market={market} />
				</div>
				{/* Outside the refreshing regions, so the chosen interval survives. */}
				<div
					id='smx-chart'
					class='smx-chart'
					hx-get={`${path}/chart?mode=candles&interval=1D`}
					hx-trigger='load'
					hx-swap='outerHTML'>
					<Skeleton
						lines={1}
						height='16rem'
						label='Loading chart' />
				</div>
				<div
					id='creator-live'
					class='smx-page'
					hx-get={path}
					hx-trigger={refresh}
					hx-select='#creator-live'
					hx-swap='outerHTML'>
					<MarketDepth
						depth={market.depth}
						quote={market.quote} />
					<CorporateActions
						actions={market.corporateActions}
						ticker={c.ticker}
						hasMore={!!page.more?.events} />
					<CreatorUpdates
						ticker={c.ticker}
						items={page.updates ?? []}
						hasMore={page.more?.updates} />
					<div class='rc-kpi-grid'>
						<Kpi
							label='Raised'
							value={formatUsdc(c.raised)}
							note={`of ${formatUsdc(c.targetRaise)} target`} />
					</div>
					<SectionCard
						title='L-ISA terms'
						context='Liquid income share agreement'>
						<dl class='rc-metadata-list smx-terms'>
							<div>
								<dt>
									Income share
								</dt>
								<dd>
									{escapeText(`${c.shareBps / 100}% of income`)}
								</dd>
							</div>
							<div>
								<dt>
									Term
								</dt>
								<dd>
									{escapeText(`${c.termMonths} months`)}
								</dd>
							</div>
							<div>
								<dt>
									Target raise
								</dt>
								<dd class='smx-num'>
									{escapeText(formatUsdc(c.targetRaise))}
								</dd>
							</div>
							<div>
								<dt>
									Creator stake
								</dt>
								<dd class='smx-num'>
									{escapeText(formatUsdc(c.stakeAmount))}
								</dd>
							</div>
							<div>
								<dt>
									Minimum income per period
								</dt>
								<dd class='smx-num'>
									{escapeText(formatUsdc(c.minIncome))}
								</dd>
							</div>
							{
								!!c.termsRef && (
									<div>
										<dt>
											0G Storage ref
										</dt>
										<dd>
											<StorageRef
												value={c.termsRef}
												status={c.termsStorage}
												label='0G Storage ref' />
										</dd>
									</div>
								)
							}
							{
								!!c.termsHash && (
									<div>
										<dt>
											Terms hash
										</dt>
										<dd>
											<HashRef
												value={c.termsHash}
												label='terms hash' />
										</dd>
									</div>
								)
							}
							{
								!!c.tokenAddress && (
									<div>
										<dt>
											Token on Hedera
										</dt>
										<dd>
											<HashRef
												value={c.tokenAddress}
												label='token address' />
										</dd>
									</div>
								)
							}
							<div>
								<dt>
									Created
								</dt>
								<dd>
									{escapeText(formatDate(c.createdAt))}
								</dd>
							</div>
						</dl>
					</SectionCard>
					<SectionCard
						title='Escrow'>
						<EscrowMeter
							ticker={c.ticker}
							tranches={c.tranches}
							status={market.status.kind}
							raised={c.raised}
							target={c.targetRaise}
							raising={raising} />
						<ol class='smx-tranches'>
							{
								c.tranches.map((t) => (
									<li>
										<span>
											{escapeText(`Tranche ${t.idx + 1}`)}
										</span>
										<span class='smx-num'>
											{escapeText(formatUsdc(t.amount))}
										</span>
										<Badge tone={TRANCHE_TONE[t.status]}>
											{escapeText(t.status.toLowerCase())}
										</Badge>
										{
											t.txHash
												? <TxLink hash={t.txHash} />
												: (
													<small>
														{
															t.releasedAt
																? escapeText(formatDate(t.releasedAt))
																: 'Awaiting proof'
														}
													</small>
												)
										}
									</li>
								))
							}
						</ol>
					</SectionCard>
					<SectionCard
						title='Holders'
						meta={
							page.more?.holders && (
								<ViewAll
									href={`${path}/holders`}
									label='holders' />
							)
						}
						count={page.holders.length}
						coinTarget>
						{
							page.holders.length === 0
								? (
									<EmptyState
										title='No holders yet'
										hint='Invest to become the first.' />
								)
								: (
									<DataTable
										caption='Top holders'
										columns={
											[
												{ label: 'Wallet' },
												{ label: 'Balance', align: 'end' },
												{ label: 'Share', align: 'end', col: 'share' },
												{ label: 'Value', align: 'end' },
											]
										}>
										{
											page.holders.map((h) => (
												<tr>
													<td>
														<span class='smx-who'>
															<Avatar
																seed={holderAvatarSeed(h)}
																size='sm' />
															<span class='smx-mono'>
																{escapeText(shortHex(h.wallet))}
															</span>
															{
																h.wallet === page.viewer.wallet && (
																	<Badge tone='info'>
																		You
																	</Badge>
																)
															}
														</span>
													</td>
													<td data-align='end'>
														{escapeText(formatTokens(h.balance))}
													</td>
													<td
														data-align='end'
														data-col='share'>
														{escapeText(`${(h.sharePct ?? 0).toFixed(1)}%`)}
													</td>
													<td data-align='end'>
														{escapeText(formatUsdc(h.value))}
													</td>
												</tr>
											))
										}
									</DataTable>
								)
						}
					</SectionCard>
					<SectionCard
						title='Income proofs'
						meta={
							page.more?.proofs && (
								<ViewAll
									href={`${path}/proofs`}
									label='income proofs' />
							)
						}
						context='Bank income verified with zkTLS.'
						count={page.proofs.length}>
						<ProofPipeline
							ticker={c.ticker}
							latestProof={page.proofs[0]}
							nextTranche={pickTranche(c.tranches, page.proofs[0])} />
						{
							page.proofs.length === 0
								? (
									<EmptyState
										title='No proofs yet' />
								)
								: (
									<DataTable
										caption='Income proofs'
										columns={
											[
												{ label: 'Period' },
												{ label: 'Income', align: 'end' },
												{ label: 'Status' },
												{ label: 'Audit', col: 'audit' },
											]
										}>
										{
											page.proofs.map((p) => (
												<tr>
													<td>
														{escapeText(`#${p.period}`)}
													</td>
													<td data-align='end'>
														{escapeText(formatUsdc(p.verifiedAmount))}
													</td>
													<td>
														<Badge tone={PROOF_TONE[p.status]}>
															{escapeText(p.status.toLowerCase())}
														</Badge>
													</td>
													<td data-col='audit'>
														<ProofAudit proof={p} />
													</td>
												</tr>
											))
										}
									</DataTable>
								)
						}
					</SectionCard>
					<SectionCard
						title='Dividends'
						meta={
							page.more?.dividends && (
								<ViewAll
									href={`${path}/dividends`}
									label='dividends' />
							)
						}
						count={page.dividends.length}>
						{
							page.dividends.length === 0
								? (
									<EmptyState
										title='No dividends yet'
										hint='Paid after the first approved proof.' />
								)
								: (
									<DataTable
										caption='Dividends'
										columns={
											[
												{ label: 'Period' },
												{ label: 'Amount', align: 'end' },
												{ label: 'Status' },
												{ label: 'Payment' },
											]
										}>
										{
											page.dividends.map((d) => (
												<tr>
													<td>
														{escapeText(`#${d.period ?? 0}`)}
													</td>
													<td data-align='end'>
														{escapeText(formatUsdc(d.amountDue))}
													</td>
													<td>
														<Badge tone={d.status === 'PAID' ? 'success' : 'warn'}>
															{escapeText(d.status === 'PAID' ? 'paid' : 'due')}
														</Badge>
													</td>
													<td>
														{
															d.paidTxHash
																? <TxLink hash={d.paidTxHash} />
																: escapeText(d.paidAt ? formatDate(d.paidAt) : '—')
														}
													</td>
												</tr>
											))
										}
									</DataTable>
								)
						}
					</SectionCard>
				</div>
				<SectionCard
					title='Events'
					meta={
						<>
							<a
								class='rc-button'
								data-size='sm'
								href={`${path}/trades`}>
								Trade history
							</a>
							{
								!!page.more?.events && (
									<ViewAll
										href={`/activity?ticker=${c.ticker}`}
										label='events' />
								)
							}
						</>
					}>
					<ul
						class='smx-feed'
						data-live-list='creator-events'
						data-live-noun='event'
						aria-live='polite'
						hx-ext='sse'
						{
							...{
								'sse-connect': `/events?ticker=${c.ticker}`,
								'sse-swap': 'oracle-event,chain-job',
							}
						}
						hx-swap='afterbegin'>
						{page.events.map((e) => <OracleEventItem event={e} />)}
					</ul>
				</SectionCard>
			</div>
			<aside
				id='trade'
				class='smx-page smx-creator-side'
				aria-label='Buy and sell'>
				<div
					id='order-live'
					class='smx-page'
					hx-get={path}
					hx-trigger='smx:traded from:body, smx:invested from:body'
					hx-select='#order-live'
					hx-swap='outerHTML'>
					<OrderTicket
						ticker={c.ticker}
						market={market}
						signedIn={signedIn} />
					{
						open && (
							<SectionCard
								title='Invest'
								context='Buy at the IPO price.'
								plain>
								<div class='smx-body'>
									{
										signedIn
											? (
												<HxForm
													action={`${path}/investments`}
													ext='json-enc'
													class='smx-form'>
													<Field
														name='usdcAmount'
														label='Amount (USDC)'
														type='text'
														required
														placeholder='100.00'
														pattern='[0-9]+(\.[0-9]{1,6})?'
														hint={`${formatUsdc(target - raised)} left to raise.`} />
													<button
														class='rc-button'
														data-variant='primary'
														type='submit'
														data-dw-sparkle>
														Invest
													</button>
													<FormError />
												</HxForm>
											)
											: (
												<button
													type='button'
													class='rc-button'
													data-variant='primary'
													data-wallet-connect>
													Connect wallet to invest
												</button>
											)
									}
								</div>
							</SectionCard>
						)
					}
				</div>
				<div
					id='creator-side'
					class='smx-page'
					hx-get={path}
					hx-trigger={refresh}
					hx-select='#creator-side'
					hx-swap='outerHTML'>
					<PositionBox
						position={market.position}
						ticker={c.ticker}
						signedIn={signedIn} />
					<Fundamentals
						fundamentals={market.fundamentals}
						ticker={c.ticker} />
				</div>
			</aside>
		</div>
	)
}
