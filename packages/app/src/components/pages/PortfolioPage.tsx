import type { Funds, Portfolio, PortfolioHolding } from '../../types/index.ts'
import { formatDate } from '../../utils/dates.ts'
import { escapeText } from '../../utils/escape.ts'
import { withQueryParams } from '../../utils/http.ts'
import { formatTokens, formatUsdc } from '../../utils/money.ts'
import type { BadgeTone } from '../../utils/tones.ts'
import { Avatar } from '../Avatar.tsx'
import { Badge } from '../Badge.tsx'
import { DataTable } from '../DataTable.tsx'
import { EmptyState } from '../EmptyState.tsx'
import { FormError } from '../forms/FormError.tsx'
import { HxForm } from '../forms/HxForm.tsx'
import { Kpi } from '../Kpi.tsx'
import { LIST_BODY_ID, Pager } from '../lists/Pager.tsx'
import { PageHeader } from '../PageHeader.tsx'
import { SectionCard } from '../SectionCard.tsx'
import { TxLink } from '../TxLink.tsx'

const HBAR_FAUCET_URL = 'https://portal.hedera.com/faucet'
const DASH = '—'

const STATUS: Record<
	PortfolioHolding['status'],
	{ label: string, tone: BadgeTone }
> = {
	LIVE: { label: 'Live', tone: 'success' },
	GRACE: { label: 'Grace period', tone: 'warn' },
	FROZEN: { label: 'Escrow frozen', tone: 'warn' },
	DEFAULTED: { label: 'Defaulted', tone: 'danger' },
	COMPLETED: { label: 'Completed', tone: 'info' },
}

const TX_TYPE = {
	INVESTMENT: { label: 'Investment', tone: 'info' },
	BUY: { label: 'Buy', tone: 'success' },
	SELL: { label: 'Sell', tone: 'danger' },
} as const

/** `GET /portfolio` for a visitor who is not signed in. */
export function PortfolioSignedOut() {
	return (
		<div class='smx-page smx-portfolio'>
			<PageHeader title='Portfolio' />
			<EmptyState
				title='Connect a wallet to see your portfolio'
				hint='Your funds, holdings, transactions and dividends appear here.'>
				<button
					type='button'
					class='rc-button'
					data-variant='primary'
					data-wallet-connect
					data-wallet-redirect='/portfolio'>
					Connect wallet
				</button>
			</EmptyState>
		</div>
	)
}

/** `GET /portfolio` for a signed-in viewer. */
export function PortfolioPage({ portfolio, live, url, cursor }: {
	portfolio: Portfolio
	/** Whether the app talks to a real chain (not the simulated one). */
	live: boolean
	/** The request URL, so "Load more" keeps the cursor. */
	url: string
	cursor?: string
}) {
	const { totals, holdings, transactions, dividends, creator, funds } =
		portfolio
	const pnl = Number(totals.pnl)
	const firstHref = cursor
		? withQueryParams(url, { cursor: undefined })
		: undefined
	return (
		<div class='smx-page smx-portfolio'>
			<PageHeader title='Portfolio' />
			<SectionCard
				title='Funds'
				plain>
				<div class='rc-kpi-grid'>
					<Kpi
						label='Available to trade'
						value={
							funds.status === 'OK'
								? formatUsdc(funds.usdc!)
								: 'Balance unavailable'
						}
						note='USDC in your wallet' />
					<Kpi
						label='HBAR'
						value={
							funds.status === 'OK'
								? `${formatTokens(funds.hbar!, 4)} HBAR`
								: 'Balance unavailable'
						}
						note='For gas and dividends' />
					<Kpi
						label='Invested'
						value={formatUsdc(totals.invested)}
						note='Open positions at cost' />
					<Kpi
						label='Current value'
						value={formatUsdc(totals.value)}
						note={`${signedUsdc(totals.pnl)} (${signedPct(totals.pnlPct)})`} />
				</div>
				<FundsActions
					funds={funds}
					live={live} />
			</SectionCard>

			<SectionCard
				title='Holdings'
				count={holdings.length}>
				{
					holdings.length
						? (
							<DataTable
								caption='Holdings'
								columns={
									[
										{ label: 'Creator' },
										{ label: 'Tokens', align: 'end' },
										{ label: 'Avg cost', align: 'end', col: 'share' },
										{ label: 'Price', align: 'end' },
										{ label: 'Value', align: 'end' },
										{ label: 'P&L', align: 'end' },
										{ label: 'P&L %', align: 'end', col: 'share' },
										{ label: 'Status', col: 'audit' },
									]
								}>
								{holdings.map((h) => <HoldingRow holding={h} />)}
								<tr data-total>
									<td>
										Total
									</td>
									<td />
									<td data-col='share' />
									<td />
									<td data-align='end'>
										{escapeText(formatUsdc(totals.value))}
									</td>
									<td
										data-align='end'
										data-dir={dir(pnl)}>
										{escapeText(signedUsdc(totals.pnl))}
									</td>
									<td
										data-align='end'
										data-col='share'
										data-dir={dir(pnl)}>
										{escapeText(signedPct(totals.pnlPct))}
									</td>
									<td data-col='audit' />
								</tr>
							</DataTable>
						)
						: (
							<EmptyState
								title='No holdings yet'
								hint='Invest in a creator to see your position here.'>
								<a
									class='rc-button'
									href='/creators'>
									Browse creators
								</a>
							</EmptyState>
						)
				}
			</SectionCard>

			<SectionCard title='Transactions'>
				{
					transactions.items.length
						? (
							<DataTable
								caption='Transactions'
								bodyId={LIST_BODY_ID}
								columns={
									[
										{ label: 'Time' },
										{ label: 'Type' },
										{ label: 'Creator' },
										{ label: 'Tokens', align: 'end', col: 'share' },
										{ label: 'USDC', align: 'end' },
										{ label: 'Price', align: 'end', col: 'share' },
										{ label: 'Transaction', col: 'audit' },
									]
								}>
								{
									transactions.items.map((t) => (
										<tr>
											<td>
												<time
													datetime={t.createdAt}
													data-local-time='time'>
													{escapeText(when(t.createdAt))}
												</time>
											</td>
											<td>
												<Badge tone={TX_TYPE[t.type].tone}>
													{escapeText(TX_TYPE[t.type].label)}
												</Badge>
											</td>
											<td>
												<a href={`/creators/${t.ticker}`}>
													{escapeText(`$${t.ticker}`)}
												</a>
											</td>
											<td
												data-align='end'
												data-col='share'>
												{escapeText(formatTokens(t.tokenAmount))}
											</td>
											<td data-align='end'>
												{escapeText(formatUsdc(t.usdcAmount))}
											</td>
											<td
												data-align='end'
												data-col='share'>
												{escapeText(formatUsdc(t.price, 4))}
											</td>
											<td data-col='audit'>
												{t.txHash ? <TxLink hash={t.txHash} /> : DASH}
											</td>
										</tr>
									))
								}
							</DataTable>
						)
						: (
							<EmptyState
								title='No transactions yet'
								hint='Investments and trades from this wallet appear here.' />
						)
				}
			</SectionCard>
			<Pager
				nextHref={
					transactions.nextPageCursor
						? withQueryParams(url, { cursor: transactions.nextPageCursor })
						: undefined
				}
				firstHref={firstHref} />

			<SectionCard
				title='Dividends received'
				context={`${formatUsdc(dividends.total)} total`}>
				{
					dividends.items.length
						? (
							<>
								<DataTable
									caption='Dividends received'
									columns={
										[
											{ label: 'Time' },
											{ label: 'Creator' },
											{ label: 'Amount', align: 'end' },
											{ label: 'Transaction', col: 'audit' },
										]
									}>
									{
										dividends.items.map((d) => (
											<tr>
												<td>
													<time
														datetime={d.createdAt}
														data-local-time='time'>
														{escapeText(when(d.createdAt))}
													</time>
												</td>
												<td>
													<a href={`/creators/${d.ticker}`}>
														{escapeText(`$${d.ticker}`)}
													</a>
												</td>
												<td data-align='end'>
													{escapeText(formatUsdc(d.amount))}
												</td>
												<td data-col='audit'>
													{d.txHash ? <TxLink hash={d.txHash} /> : DASH}
												</td>
											</tr>
										))
									}
								</DataTable>
								{
									dividends.count > dividends.items.length && (
										<p class='smx-portfolio__more'>
											{
												escapeText(
													`Showing the latest ${dividends.items.length} of ${
														dividends.count
													} payouts.`,
												)
											}
										</p>
									)
								}
							</>
						)
						: (
							<EmptyState
								title='No dividends yet'
								hint='Payouts from creators you hold appear here.' />
						)
				}
			</SectionCard>

			{
				!!creator && (
					<SectionCard
						title='Your IPO'
						plain
						meta={
							<a href='/hub'>
								Open creator hub
							</a>
						}>
						<p class='smx-portfolio__more'>
							{escapeText(`$${creator.ticker}, ${creator.displayName}`)}
						</p>
					</SectionCard>
				)
			}
		</div>
	)
}

function HoldingRow({ holding: h }: { holding: PortfolioHolding }) {
	const pnl = Number(h.pnl)
	const status = STATUS[h.status]
	return (
		<tr>
			<td>
				<a
					class='smx-asset'
					href={`/creators/${h.ticker}`}>
					<Avatar
						seed={h.creatorId}
						fallbackFor={h.displayName} />
					<span>
						{escapeText(`$${h.ticker}`)}
					</span>
				</a>
			</td>
			<td data-align='end'>
				{escapeText(formatTokens(h.tokens))}
			</td>
			<td
				data-align='end'
				data-col='share'>
				{escapeText(formatUsdc(h.avgCost, 4))}
			</td>
			<td data-align='end'>
				{escapeText(formatUsdc(h.price, 4))}
			</td>
			<td data-align='end'>
				{escapeText(formatUsdc(h.value))}
			</td>
			<td
				data-align='end'
				data-dir={dir(pnl)}>
				{escapeText(signedUsdc(h.pnl))}
			</td>
			<td
				data-align='end'
				data-col='share'
				data-dir={dir(pnl)}>
				{escapeText(signedPct(h.pnlPct))}
			</td>
			<td data-col='audit'>
				<Badge
					tone={status.tone}
					title={h.statusLabel}>
					{escapeText(status.label)}
				</Badge>
			</td>
		</tr>
	)
}

function FundsActions({ funds, live }: { funds: Funds, live: boolean }) {
	return (
		<div class='smx-funds-actions'>
			{
				funds.canRequestUsdc && (
					<HxForm action='/portfolio/faucet'>
						<button
							type='submit'
							class='rc-button'
							data-variant='primary'>
							Get test USDC
						</button>
						<FormError />
					</HxForm>
				)
			}
			<a
				class='rc-button'
				href={HBAR_FAUCET_URL}
				target='_blank'
				rel='noopener noreferrer'>
				Fund HBAR
			</a>
			{
				funds.status !== 'OK' && (
					<p class='smx-funds-note'>
						{
							live
								? 'We could not read your wallet. Try again in a moment.'
								: 'Balances show on the live chain.'
						}
					</p>
				)
			}
		</div>
	)
}

function dir(n: number) {
	return n > 0 ? 'up' : n < 0 ? 'down' : 'flat'
}

/** `+$12.50`, `-$3.00`, `$0.00`. */
function signedUsdc(value: string) {
	return `${Number(value) > 0 ? '+' : ''}${formatUsdc(value)}`
}

/** `+4.20%`, `-1.00%`, `0.00%`. */
function signedPct(value: string) {
	const n = Number(value)
	return `${n > 0 ? '+' : ''}${n.toFixed(2)}%`
}

/** `May 19, 2026 12:30:05` (UTC) from an ISO timestamp. */
function when(iso: string) {
	return `${formatDate(iso)} ${iso.slice(11, 19)}`
}
