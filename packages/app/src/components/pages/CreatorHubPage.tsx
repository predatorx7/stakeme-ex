/* eslint-disable @stylistic/max-len -- deeply nested JSX copy */
import type { Children } from '@kitajs/html'
import { DEMO_MODE } from '../../consts.ts'
import type { CreatorHub } from '../../types/index.ts'
import { formatDate } from '../../utils/dates.ts'
import { escapeText } from '../../utils/escape.ts'
import { formatUsdc } from '../../utils/money.ts'
import { Badge } from '../Badge.tsx'
import { BlockingWarning } from '../BlockingWarning.tsx'
import { ChainJobBadge, PendingChainBadge } from '../ChainJobBadge.tsx'
import { Countdown } from '../Countdown.tsx'
import { CreatorStatusBadge, isEscrowFrozen } from '../CreatorStatus.tsx'
import { DataTable } from '../DataTable.tsx'
import { EmptyState } from '../EmptyState.tsx'
import { FormError } from '../forms/FormError.tsx'
import { HxForm } from '../forms/HxForm.tsx'
import { PageHeader } from '../PageHeader.tsx'
import { LinearProgress } from '../Progress.tsx'
import { SectionCard } from '../SectionCard.tsx'
import { HashRef, TxLink } from '../TxLink.tsx'

const FN_LABEL = {
	createISA: 'Create L-ISA',
	initializeIPO: 'Open IPO',
	invest: 'Record investment',
	unlockNextTranche: 'Release tranche',
	distributeDividend: 'Pay dividend',
	executeLiquidation: 'Liquidate',
} as const

const PROOF_TONE = {
	PENDING: 'warn',
	APPROVED: 'success',
	REJECTED: 'danger',
} as const

/** A region that reloads itself when a mutation or an oracle event lands. */
function Live({ id, children }: { id: string, children: Children }) {
	return (
		<div
			id={id}
			class='smx-page'
			hx-get='/hub'
			hx-trigger={
				'smx:dividend-paid from:body, '
				+ 'smx:oracle-event[detail.kind!=\'TRADE\'] from:body delay:1s'
			}
			hx-select={`#${id}`}
			hx-swap='outerHTML'>
			{children}
		</div>
	)
}

/** End of the L-ISA term: the creation date plus the term in months. */
function termEnd(createdAt: string, months: number) {
	const d = new Date(createdAt)
	d.setUTCMonth(d.getUTCMonth() + months)
	return d.toISOString()
}

/**
 * Creator hub: term and proof deadlines, escrow, the Reclaim bank proof, the
 * dividend due, collateral and onchain job status. Regions reload on oracle
 * events; the Reclaim card and the feed stay put so a QR code is not wiped.
 */
export function CreatorHubPage({ hub }: { hub: CreatorHub }) {
	const c = hub.creator
	if(!c) {
		return (
			<div class='smx-page'>
				<PageHeader
					eyebrow='Creator hub'
					title='Creator hub' />
				<EmptyState
					title='You have not launched an IPO'
					hint='Launch one to raise funds against your future income.'>
					<a
						class='rc-button'
						data-variant='primary'
						href='/launch'>
						Launch your IPO
					</a>
				</EmptyState>
			</div>
		)
	}

	const proofs = hub.proofs ?? []
	const dividends = hub.dividends ?? []
	const jobs = hub.chainJobs ?? []
	const frozen = isEscrowFrozen(c.status)
	const total = Number(c.escrow.locked) + Number(c.escrow.released)
		+ Number(c.escrow.refunded)
	const releasedPct = total > 0 ? Math.round(Number(c.escrow.released) / total * 100) : 0
	const due = hub.pendingDividend
	const income = due ? Number(due.amountDue) / (c.shareBps / 10_000) : 0
	const period = proofs.filter((p) => p.status === 'APPROVED').length
	const nextDue = c.status === 'GRACE' ? c.graceUntil : c.nextProofDueAt
	const collateral = hub.collateral
	return (
		<div class='smx-page'>
			<Live id='hub-top'>
				<PageHeader
					eyebrow={`$${c.ticker}`}
					title='Creator hub'
					lede={c.displayName}
					meta={
						<>
							<CreatorStatusBadge
								status={c.status}
								frozen={frozen} />
							<PendingChainBadge
								creatorId={c.id}
								pending={c.chain.pendingJobs} />
						</>
					}
					actions={
						<a
							class='rc-button'
							href={`/creators/${c.ticker}`}>
							View token page
						</a>
					} />
				{
					c.status === 'DEFAULTED' && (
						<BlockingWarning
							title={
								'Liquidated: escrow refunded, stake slashed, '
								+ 'World ID banned'
							}>
							You missed the proof deadline and the grace period.
						</BlockingWarning>
					)
				}
				{
					frozen && c.status !== 'DEFAULTED' && (
						<BlockingWarning title='Escrow frozen by 0G agent: proof overdue'>
							Submit a bank proof before the grace period ends to unfreeze it.
						</BlockingWarning>
					)
				}
				<div class='rc-kpi-grid'>
					<article class='rc-kpi'>
						<span class='rc-kpi__label'>
							Time left
						</span>
						<strong class='rc-kpi__value'>
							<Countdown until={termEnd(c.ipoAt ?? c.createdAt, c.termMonths)} />
						</strong>
						<span class='rc-kpi__delta'>
							{escapeText(`of a ${c.termMonths}-month term`)}
						</span>
					</article>
					<article class='rc-kpi'>
						<span class='rc-kpi__label'>
							{c.status === 'GRACE' ? 'Grace period ends' : 'Next proof due'}
						</span>
						<strong class='rc-kpi__value'>
							{
								nextDue
									? <Countdown until={nextDue} />
									: escapeText('—')
							}
						</strong>
						<span class='rc-kpi__delta'>
							{escapeText(nextDue ? formatDate(nextDue) : 'No deadline')}
						</span>
					</article>
					<article class='rc-kpi'>
						<span class='rc-kpi__label'>
							Escrow released
						</span>
						<strong class='rc-kpi__value'>
							{escapeText(`${releasedPct}%`)}
						</strong>
						<span class='rc-kpi__delta'>
							{escapeText(`${formatUsdc(c.escrow.released)} of ${formatUsdc(total)}`)}
						</span>
					</article>
				</div>
				<div class='smx-layout'>
					<SectionCard
						title='Pending dividend'
						context={`${c.shareBps / 100}% of proven income`}
						plain>
						<div class='smx-body'>
							{
								due
									? (
										<>
											<p>
												{
													escapeText(
														`0G AI detected ${formatUsdc(income)} income. `
														+ `You owe ${formatUsdc(due.amountDue)} USDC.`,
													)
												}
											</p>
											<div class='smx-actions'>
												<button
													type='button'
													class='rc-button'
													data-variant='primary'
													data-hedera-pay={`/dividends/${due.id}/payment-request`}
													data-hedera-settle={`/dividends/${due.id}/payment`}>
													{escapeText(`Pay ${formatUsdc(due.amountDue)} USDC on Hedera`)}
												</button>
												<output data-hedera-pay-status />
											</div>
											{
												DEMO_MODE && (
													<HxForm
														action={`/dividends/${due.id}/payment`}
														class='smx-form'>
														<button
															type='submit'
															class='rc-button'
															data-variant='inline'>
															Mark as paid (demo)
														</button>
														<FormError />
													</HxForm>
												)
											}
										</>
									)
									: (
										<p>
											Nothing due. The next dividend appears after an approved proof.
										</p>
									)
							}
						</div>
					</SectionCard>
					<SectionCard
						title='Collateral'
						context='Your stake backs investor funds.'
						plain>
						<div class='smx-body'>
							<span class='smx-big'>
								{escapeText(formatUsdc(collateral?.stakeAmount ?? c.stakeAmount))}
							</span>
							<p>
								{
									c.status === 'DEFAULTED'
										? (
											<Badge tone='danger'>
												Slashed
											</Badge>
										)
										: collateral?.atRisk
											? (
												<Badge tone='warn'>
													At risk
												</Badge>
											)
											: (
												<Badge tone='success'>
													Secured
												</Badge>
											)
								}
							</p>
						</div>
					</SectionCard>
				</div>
			</Live>
			<div class='smx-page'>
				<SectionCard
					title='Web2 income verification'
					context='Bank proof via Reclaim zkTLS. The 0G agent audits it against your terms.'
					plain>
					<section
						class='smx-body smx-reclaim'
						data-reclaim>
						<p>
							{
								escapeText(
									`Prove a deposit of at least ${formatUsdc(c.minIncome)} `
									+ 'to release the next tranche.',
								)
							}
						</p>
						<div class='smx-actions'>
							<button
								type='button'
								class='rc-button'
								data-variant='primary'
								data-reclaim-start={`/creators/${c.ticker}/reclaim-sessions`}
								data-reclaim-body={JSON.stringify({ period })}
								disabled={c.status === 'DEFAULTED'}>
								Verify income with Reclaim
							</button>
							{
								DEMO_MODE && (
									<button
										type='button'
										class='rc-button'
										data-reclaim-demo='/api/audit-milestone'
										data-reclaim-demo-context={c.id}
										data-reclaim-demo-amount='5000.00'
										data-reclaim-demo-field='proof'
										data-reclaim-body={JSON.stringify({ ticker: c.ticker, period })}
										disabled={c.status === 'DEFAULTED'}>
										Simulate $5,000 deposit
									</button>
								)
							}
						</div>
						<div
							data-reclaim-output
							hidden />
					</section>
				</SectionCard>
			</div>
			<Live id='hub-bottom'>
				<SectionCard
					title='Escrow'
					context='Tranches release as the 0G agent approves proofs.'>
					<div class='smx-escrow'>
						<LinearProgress
							value={releasedPct}
							label='Released to you'
							valueLabel={`${formatUsdc(c.escrow.released)} of ${formatUsdc(total)}`}
							tone={frozen ? 'warning' : undefined} />
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
									<Badge
										tone={
											t.status === 'RELEASED'
												? 'success'
												: t.status === 'REFUNDED'
													? 'info'
													: 'warn'
										}>
										{escapeText(t.status.toLowerCase())}
									</Badge>
									{
										t.txHash ? <TxLink hash={t.txHash} /> : (
											<small>
												Locked
											</small>
										)
									}
								</li>
							))
						}
					</ol>
				</SectionCard>
				<SectionCard
					title='Onchain jobs'
					context='Pending until the transaction confirms.'
					count={jobs.length}>
					{
						jobs.length === 0
							? <EmptyState title='No onchain jobs yet' />
							: (
								<DataTable
									caption='Onchain jobs'
									columns={
										[
											{ label: 'Action' },
											{ label: 'Status' },
											{ label: 'Transaction' },
										]
									}>
									{
										jobs.map((j) => (
											<tr>
												<td>
													{escapeText(FN_LABEL[j.fn])}
												</td>
												<td>
													<ChainJobBadge
														id={j.id}
														status={j.status} />
												</td>
												<td data-job-tx={j.id}>
													{j.txHash ? <TxLink hash={j.txHash} /> : '—'}
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
					count={proofs.length}>
					{
						proofs.length === 0
							? (
								<EmptyState
									title='No proofs yet'
									hint='Verify your income to submit the first one.' />
							)
							: (
								<DataTable
									caption='Income proofs'
									columns={
										[
											{ label: 'Period' },
											{ label: 'Income', align: 'end' },
											{ label: 'Status' },
											{ label: 'Audit' },
										]
									}>
									{
										proofs.map((p) => (
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
												<td>
													<span title={p.reasoning ?? p.rejectReason}>
														{
															escapeText(
																p.model === 'rules-engine'
																	? 'Rules engine'
																	: p.model ? '0G Compute' : 'Pending',
															)
														}
													</span>
													{
														!!p.auditLogRef && (
															<>
																{' '}
																<HashRef
																	value={p.auditLogRef}
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
					title='Dividends paid'
					count={dividends.length}>
					{
						dividends.length === 0
							? <EmptyState title='No dividends yet' />
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
										dividends.map((d) => (
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
													{d.paidTxHash ? <TxLink hash={d.paidTxHash} /> : '—'}
												</td>
											</tr>
										))
									}
								</DataTable>
							)
					}
				</SectionCard>
			</Live>
			<div class='smx-page'>
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
						hx-swap='afterbegin' />
				</SectionCard>
			</div>
		</div>
	)
}
