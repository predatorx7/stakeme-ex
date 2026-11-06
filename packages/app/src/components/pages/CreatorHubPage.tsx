/* eslint-disable @stylistic/max-len -- deeply nested JSX copy */
import type { Children } from '@kitajs/html'
import { DEMO_MODE } from '../../consts.ts'
import { BANK_SCENARIOS } from '../../services/mock-bank.ts'
import type { CreatorHub } from '../../types/index.ts'
import { formatDate } from '../../utils/dates.ts'
import { escapeText } from '../../utils/escape.ts'
import { formatUsdc } from '../../utils/money.ts'
import { Badge } from '../Badge.tsx'
import { BlockingWarning } from '../BlockingWarning.tsx'
import { ChainJobBadge, PendingChainBadge } from '../ChainJobBadge.tsx'
import { Countdown } from '../Countdown.tsx'
import { UpdateComposer } from '../creator/UpdateComposer.tsx'
import { CreatorStatusBadge, isEscrowFrozen } from '../CreatorStatus.tsx'
import { DataTable } from '../DataTable.tsx'
import { DividendCard, DividendReceiptCell } from '../DividendCard.tsx'
import { EmptyState } from '../EmptyState.tsx'
import { HxForm } from '../forms/HxForm.tsx'
import { ProofCountdown } from '../instrument/ProofCountdown.tsx'
import { pickTranche, ProofPipeline } from '../instrument/ProofPipeline.tsx'
import { ViewAll } from '../lists/ViewAll.tsx'
import { PageHeader } from '../PageHeader.tsx'
import { LinearProgress } from '../Progress.tsx'
import { ProofAudit } from '../ProofAudit.tsx'
import { SectionCard } from '../SectionCard.tsx'
import { TxLink } from '../TxLink.tsx'
import { ZeroGBalance } from '../ZeroGBalance.tsx'

const FN_LABEL = {
	createISA: 'Create L-ISA',
	initializeIPO: 'Open IPO',
	invest: 'Record investment',
	unlockNextTranche: 'Release tranche',
	distributeDividend: 'Pay dividend',
	executeLiquidation: 'Liquidate',
	closeRaise: 'Close raise',
	reclaimStake: 'Reclaim stake',
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
				'smx:dividend-paid from:body, smx:raise-closed from:body, '
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
				<PageHeader title='Creator hub' />
				<EmptyState
					title='No IPO yet'
					hint='Launch one to raise against your future income.'>
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
					avatar={c.id}
					lede={c.displayName}
					meta={
						<>
							<CreatorStatusBadge
								status={c.status}
								frozen={frozen} />
							<PendingChainBadge
								creatorId={c.id}
								pending={c.chain.pendingJobs} />
							<ZeroGBalance />
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
							title='Liquidated: proof deadline missed'>
							Escrow refunded, stake slashed, World ID banned.
						</BlockingWarning>
					)
				}
				{
					frozen && c.status !== 'DEFAULTED' && (
						<BlockingWarning title='Escrow frozen: proof overdue'>
							Submit a bank proof before the grace period ends.
						</BlockingWarning>
					)
				}
				{
					c.status === 'LIVE' && Number(c.raised) > 0
					&& c.tranches[0]?.status === 'LOCKED' && (
						<HxForm
							action={`/creators/${c.ticker}/close-raise`}
							ext='json-enc'
							class='smx-actions'>
							<button
								type='submit'
								class='rc-button'
								data-variant='primary'>
								Close raise now
							</button>
							<span class='form-error' />
						</HxForm>
					)
				}
				<div class='rc-kpi-grid'>
					<article class='rc-kpi smx-dw-hub-time'>
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
									? c.status === 'GRACE'
										? <Countdown until={nextDue} />
										: (
											<ProofCountdown
												dueAt={nextDue}
												status={c.status === 'DRAFT' ? 'LIVE' : c.status} />
										)
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
										<DividendCard
											dividendId={due.id}
											amountDue={due.amountDue}
											income={income}
											shareBps={c.shareBps} />
									)
									: (
										<p>
											Nothing due until the next approved proof.
										</p>
									)
							}
						</div>
					</SectionCard>
					<SectionCard
						title='Collateral'
						context='Slashed if you default.'
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
			<ProofPipeline
				ticker={c.ticker}
				latestProof={proofs[0]}
				nextTranche={pickTranche(c.tranches, proofs[0])} />
			<div class='smx-page'>
				<SectionCard
					title='Web2 income verification'
					context='Bank proof via Reclaim, audited by the 0G agent.'
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
								data-dw-sparkle
								data-reclaim-start={`/creators/${c.ticker}/reclaim-sessions`}
								data-reclaim-body={JSON.stringify({ period })}
								disabled={c.status === 'DEFAULTED'}>
								Verify income with Reclaim
							</button>
							{
								DEMO_MODE && (
									<>
										<select
											class='rc-select'
											aria-label='Demo income scenario'
											data-reclaim-demo-scenario>
											{
												BANK_SCENARIOS.filter((s) => s.demoAmount).map((s) => (
													<option
														value={s.demoAmount!}
														selected={s.id === 'salary'}>
														{escapeText(`${s.label} (${formatUsdc(s.demoAmount!)})`)}
													</option>
												))
											}
										</select>
										<button
											type='button'
											class='rc-button'
											data-reclaim-demo='/api/audit-milestone'
											data-reclaim-demo-context={c.id}
											data-reclaim-demo-amount='5000.00'
											data-reclaim-demo-field='proof'
											data-reclaim-body={JSON.stringify({ ticker: c.ticker, period })}
											disabled={c.status === 'DEFAULTED'}>
											Simulate deposit
										</button>
									</>
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
								<li data-tranche={t.status}>
									<span class='smx-dw-tranche'>
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
											'—'
										)
									}
								</li>
							))
						}
					</ol>
				</SectionCard>
				<SectionCard
					title='Onchain jobs'
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
					meta={
						hub.more?.proofs && (
							<ViewAll
								href={`/creators/${c.ticker}/proofs`}
								label='income proofs' />
						)
					}
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
					title='Dividends paid'
					meta={
						hub.more?.dividends && (
							<ViewAll
								href={`/creators/${c.ticker}/dividends`}
								label='dividends' />
						)
					}
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
													{d.paidTxHash ? <TxLink hash={d.paidTxHash} /> : <DividendReceiptCell dividendId={d.id} />}
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
				<UpdateComposer
					ticker={c.ticker}
					updatesLeft={hub.updatesLeft} />
				<SectionCard
					title='Oracle events'
					meta={
						hub.more?.events && (
							<ViewAll
								href={`/activity?ticker=${c.ticker}`}
								label='events' />
						)
					}>
					<ul
						class='smx-feed'
						data-live-list='hub-events'
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
