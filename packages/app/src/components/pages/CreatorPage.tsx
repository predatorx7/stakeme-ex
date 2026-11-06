/* eslint-disable @stylistic/max-len -- deeply nested JSX copy */
import type { CreatorPage as CreatorPageData } from '../../types/index.ts'
import { formatDate } from '../../utils/dates.ts'
import { escapeText } from '../../utils/escape.ts'
import { formatTokens, formatUsdc, shortHex } from '../../utils/money.ts'
import { Badge } from '../Badge.tsx'
import { BlockingWarning } from '../BlockingWarning.tsx'
import { PendingChainBadge } from '../ChainJobBadge.tsx'
import { PriceChart } from '../charts/PriceChart.tsx'
import { CreatorStatusBadge, isEscrowFrozen } from '../CreatorStatus.tsx'
import { DataTable } from '../DataTable.tsx'
import { EmptyState } from '../EmptyState.tsx'
import { OracleEventItem } from '../events/OracleEventItem.tsx'
import { Field } from '../forms/Field.tsx'
import { FormError } from '../forms/FormError.tsx'
import { HxForm } from '../forms/HxForm.tsx'
import { Kpi } from '../Kpi.tsx'
import { PageHeader } from '../PageHeader.tsx'
import { PriceChange } from '../PriceChange.tsx'
import { LinearProgress } from '../Progress.tsx'
import { SectionCard } from '../SectionCard.tsx'
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

/** Percent of `part` in `whole`, clamped to 0 to 100. */
function pct(part: number, whole: number) {
	return whole > 0 ? Math.min(100, Math.max(0, part / whole * 100)) : 0
}

/**
 * Token page. The market region (price, chart, terms, escrow, holders, proofs)
 * reloads after a trade, investment or oracle event. The forms and the event
 * feed sit outside it, so typing and the SSE connection are not interrupted.
 */
export function CreatorPage({ page }: { page: CreatorPageData }) {
	const c = page.creator
	const path = `/creators/${c.ticker}`
	const frozen = isEscrowFrozen(c.status, page.events)
	const trading = c.status === 'LIVE' || c.status === 'GRACE'
	const raised = Number(c.raised)
	const target = Number(c.targetRaise)
	const open = c.status === 'LIVE' && raised < target
	const signedIn = !!page.viewer.wallet
	const escrowTotal = Number(c.escrow.locked) + Number(c.escrow.released)
		+ Number(c.escrow.refunded)
	const held = page.viewer.holding
	return (
		<div class='smx-layout'>
			<div>
				<div
					id='creator-live'
					class='smx-page'
					hx-get={path}
					hx-trigger={
						'smx:traded from:body, smx:invested from:body, '
						+ 'smx:dividend-paid from:body, '
						+ 'smx:oracle-event from:body delay:1s'
					}
					hx-select='#creator-live'
					hx-swap='outerHTML'>
					<PageHeader
						eyebrow={`$${c.ticker}`}
						title={c.displayName}
						lede={c.headline}
						meta={
							<>
								<span class='smx-price'>
									<strong>
										{escapeText(formatUsdc(c.price, 4))}
									</strong>
									<PriceChange value={c.change24h} />
								</span>
								<CreatorStatusBadge
									status={c.status}
									frozen={frozen} />
								<PendingChainBadge
									creatorId={c.id}
									pending={c.chain.pendingJobs} />
							</>
						} />
					{
						c.status === 'DEFAULTED' && (
							<BlockingWarning
								title={
									'Liquidated: escrow refunded, stake slashed, '
									+ 'World ID banned'
								}>
								Trading and new investments are closed.
							</BlockingWarning>
						)
					}
					{
						frozen && c.status !== 'DEFAULTED' && (
							<BlockingWarning title='Escrow frozen by 0G agent: proof overdue'>
								{
									c.graceUntil
										? 'No tranche releases until the creator submits a proof. '
										+ `The grace period ends ${formatDate(c.graceUntil)}; `
										+ 'then the escrow is refunded.'
										: 'No tranche releases until the creator submits a proof.'
								}
							</BlockingWarning>
						)
					}
					<div class='rc-kpi-grid'>
						<Kpi
							label='24h volume'
							value={formatUsdc(c.volume24h)}
							note='USDC traded' />
						<Kpi
							label='Raised'
							value={formatUsdc(c.raised)}
							note={`of ${formatUsdc(c.targetRaise)} target`} />
						<Kpi
							label='Income share'
							value={`${c.shareBps / 100}%`}
							note={`for ${c.termMonths} months`} />
					</div>
					{
						page.chart.length > 1 && (
							<PriceChart
								title='Price'
								name={`${c.displayName} price history`}
								points={page.chart} />
						)
					}
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
						title='Escrow'
						context='Investor funds release in tranches as income is proven.'
						meta={
							frozen && c.status !== 'DEFAULTED'
								? (
									<Badge tone='warn'>
										Frozen
									</Badge>
								)
								: undefined
						}>
						<div class='smx-escrow'>
							<LinearProgress
								value={Math.round(pct(raised, target))}
								label='Raised'
								valueLabel={`${formatUsdc(c.raised)} of ${formatUsdc(c.targetRaise)}`} />
							<LinearProgress
								value={Math.round(pct(Number(c.escrow.released), escrowTotal))}
								label='Released to creator'
								valueLabel={`${formatUsdc(c.escrow.released)} of ${formatUsdc(escrowTotal)}`}
								tone={frozen ? 'warning' : undefined}
								note={
									Number(c.escrow.refunded) > 0
										? `${formatUsdc(c.escrow.refunded)} refunded to investors`
										: `${formatUsdc(c.escrow.locked)} still locked`
								} />
						</div>
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
						count={page.holders.length}>
						{
							page.holders.length === 0
								? (
									<EmptyState
										title='No holders yet'
										hint='Buy in the primary market to become the first.' />
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
														<span class='smx-mono'>
															{escapeText(shortHex(h.wallet))}
														</span>
														{
															h.wallet === page.viewer.wallet && (
																<>
																	{' '}
																	<Badge tone='info'>
																		You
																	</Badge>
																</>
															)
														}
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
						context='Bank proof via Reclaim zkTLS, audited by the 0G agent.'
						count={page.proofs.length}>
						{
							page.proofs.length === 0
								? (
									<EmptyState
										title='No proofs yet'
										hint='The creator submits the first proof when it is due.' />
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
														<span title={p.reasoning ?? p.rejectReason}>
															{
																escapeText(
																	p.model === 'rules-engine'
																		? 'Rules engine'
																		: p.model
																			? '0G Compute'
																			: 'Pending',
																)
															}
														</span>
														{
															!!p.auditLogRef && (
																<>
																	{' '}
																	<StorageRef
																		value={p.auditLogRef}
																		status={p.auditLogStorage}
																		label='0G Storage log ref' />
																</>
															)
														}
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
						count={page.dividends.length}>
						{
							page.dividends.length === 0
								? (
									<EmptyState
										title='No dividends yet'
										hint='A dividend appears after the first approved proof.' />
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
					context={`Live oracle events for $${c.ticker}.`}>
					<ul
						class='smx-feed'
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
				class='smx-page'
				aria-label='Buy and sell'>
				<SectionCard
					title='Invest'
					context='Buy at the IPO price from the primary market.'
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
											hint={
												open
													? `${formatUsdc(raised >= target ? 0 : target - raised)} left in the raise.`
													: 'The raise is closed.'
											}
											disabled={!open} />
										<button
											class='rc-button'
											data-variant='primary'
											type='submit'
											disabled={!open}>
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
				<SectionCard
					title='Trade'
					context='Swap against the pool. A 0.3% fee applies.'
					plain>
					<div class='smx-body'>
						{
							signedIn
								? (
									<HxForm
										action={`${path}/trades`}
										ext='json-enc'
										class='smx-form'>
										<fieldset
											class='smx-side'
											disabled={!trading}>
											<legend class='rc-visually-hidden'>
												Side
											</legend>
											<label>
												<input
													type='radio'
													name='side'
													value='BUY'
													checked />
												Buy
											</label>
											<label>
												<input
													type='radio'
													name='side'
													value='SELL' />
												Sell
											</label>
										</fieldset>
										<Field
											name='amountIn'
											label='Amount in'
											type='text'
											required
											placeholder='50'
											pattern='[0-9]+(\.[0-9]{1,18})?'
											hint='USDC when you buy, tokens when you sell.'
											disabled={!trading} />
										<Field
											name='minOut'
											label='Minimum received'
											type='text'
											value='0'
											pattern='[0-9]+(\.[0-9]{1,18})?'
											hint='The trade fails if the output is lower.'
											disabled={!trading} />
										<button
											class='rc-button'
											data-variant='primary'
											type='submit'
											disabled={!trading}>
											Place trade
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
										Connect wallet to trade
									</button>
								)
						}
						{
							!!held && (
								<p>
									{
										escapeText(
											`You hold ${formatTokens(held.balance)} $${c.ticker} `
											+ `(${formatUsdc(held.value)}).`,
										)
									}
								</p>
							)
						}
					</div>
				</SectionCard>
			</aside>
		</div>
	)
}
