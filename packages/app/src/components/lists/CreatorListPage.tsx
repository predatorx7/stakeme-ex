import type {
	CreatorPage,
	Dividend,
	Holding,
	IncomeProof,
	Trade,
} from '../../types/index.ts'
import { formatDate } from '../../utils/dates.ts'
import { escapeText } from '../../utils/escape.ts'
import { withQueryParams } from '../../utils/http.ts'
import { formatTokens, formatUsdc, shortHex } from '../../utils/money.ts'
import { Badge } from '../Badge.tsx'
import { DataTable } from '../DataTable.tsx'
import { EmptyState } from '../EmptyState.tsx'
import { PageHeader } from '../PageHeader.tsx'
import { ProofAudit } from '../ProofAudit.tsx'
import { SectionCard } from '../SectionCard.tsx'
import { TxLink } from '../TxLink.tsx'
import { LIST_BODY_ID, Pager } from './Pager.tsx'

type CreatorRef = Pick<
	CreatorPage['creator'],
	'ticker' | 'displayName' | 'status'
>

type Shared = {
	creator: CreatorRef
	nextPageCursor?: string
	cursor?: string
	/** The request URL, so page links keep the cursor. */
	url: string
}

const PROOF_TONE = {
	PENDING: 'warn',
	APPROVED: 'success',
	REJECTED: 'danger',
} as const

/**
 * The frame of every `/creators/{ticker}/<list>` page: header with a link back
 * to the token page, one card holding the table, and the pager.
 */
function CreatorListFrame(props: Shared & {
	title: string
	empty: { title: string, hint?: string }
	hasItems: boolean
	children: JSX.Element
}) {
	const { creator: c, url } = props
	return (
		<div class='smx-page'>
			<PageHeader
				eyebrow={`$${c.ticker}`}
				title={props.title}
				lede={c.displayName}
				actions={
					<a
						class='rc-button'
						href={`/creators/${c.ticker}`}>
						{escapeText(`Back to $${c.ticker}`)}
					</a>
				} />
			<SectionCard title={props.title}>
				{
					props.hasItems
						? props.children
						: (
							<EmptyState
								title={props.empty.title}
								hint={props.empty.hint} />
						)
				}
			</SectionCard>
			<Pager
				nextHref={
					props.nextPageCursor
						? withQueryParams(url, { cursor: props.nextPageCursor })
						: undefined
				}
				firstHref={
					props.cursor
						? withQueryParams(url, { cursor: undefined })
						: undefined
				} />
		</div>
	)
}

/** `GET /creators/{ticker}/holders` */
export function HoldersListPage(props: Shared & {
	items: Holding[]
	viewerWallet?: string | null
}) {
	return (
		<CreatorListFrame
			{...props}
			title='Holders'
			hasItems={props.items.length > 0}
			empty={{ title: 'No holders yet', hint: 'Be the first at the IPO.' }}>
			<DataTable
				caption='Holders'
				bodyId={LIST_BODY_ID}
				columns={
					[
						{ label: 'Wallet' },
						{ label: 'Balance', align: 'end' },
						{ label: 'Share', align: 'end', col: 'share' },
						{ label: 'Value', align: 'end' },
					]
				}>
				{
					props.items.map((h) => (
						<tr>
							<td>
								<span class='smx-mono'>
									{escapeText(shortHex(h.wallet))}
								</span>
								{
									h.wallet === props.viewerWallet && (
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
		</CreatorListFrame>
	)
}

/** `GET /creators/{ticker}/trades` */
export function TradesListPage(props: Shared & { items: Trade[] }) {
	return (
		<CreatorListFrame
			{...props}
			title='Trades'
			hasItems={props.items.length > 0}
			empty={{ title: 'No trades yet' }}>
			<DataTable
				caption='Trades'
				bodyId={LIST_BODY_ID}
				columns={
					[
						{ label: 'Time' },
						{ label: 'Side' },
						{ label: 'USDC', align: 'end' },
						{ label: 'Tokens', align: 'end', col: 'share' },
						{ label: 'Price', align: 'end' },
						{ label: 'Wallet', col: 'audit' },
					]
				}>
				{
					props.items.map((t) => (
						<tr>
							<td>
								<time
									datetime={t.createdAt}
									data-local-time='time'>
									{escapeText(when(t.createdAt))}
								</time>
							</td>
							<td>
								<Badge tone={t.side === 'BUY' ? 'success' : 'danger'}>
									{escapeText(t.side.toLowerCase())}
								</Badge>
							</td>
							<td data-align='end'>
								{escapeText(formatUsdc(t.usdcAmount))}
							</td>
							<td
								data-align='end'
								data-col='share'>
								{escapeText(formatTokens(t.tokenAmount))}
							</td>
							<td data-align='end'>
								{escapeText(formatUsdc(t.price, 4))}
							</td>
							<td data-col='audit'>
								<span class='smx-mono'>
									{escapeText(shortHex(t.wallet))}
								</span>
								{' '}
								{!!t.txHash && <TxLink hash={t.txHash} />}
							</td>
						</tr>
					))
				}
			</DataTable>
		</CreatorListFrame>
	)
}

/** `GET /creators/{ticker}/proofs` */
export function ProofsListPage(props: Shared & { items: IncomeProof[] }) {
	return (
		<CreatorListFrame
			{...props}
			title='Income proofs'
			hasItems={props.items.length > 0}
			empty={
				{
					title: 'No income proofs yet',
					hint: 'Proofs appear after each income period.',
				}
			}>
			<DataTable
				caption='Income proofs'
				bodyId={LIST_BODY_ID}
				columns={
					[
						{ label: 'Period' },
						{ label: 'Income', align: 'end' },
						{ label: 'Status' },
						{ label: 'Audit', col: 'audit' },
					]
				}>
				{
					props.items.map((p) => (
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
		</CreatorListFrame>
	)
}

/** `GET /creators/{ticker}/dividends` */
export function DividendsListPage(props: Shared & { items: Dividend[] }) {
	return (
		<CreatorListFrame
			{...props}
			title='Dividends'
			hasItems={props.items.length > 0}
			empty={
				{
					title: 'No dividends paid yet',
					hint: 'Dividends follow the first approved proof.',
				}
			}>
			<DataTable
				caption='Dividends'
				bodyId={LIST_BODY_ID}
				columns={
					[
						{ label: 'Period' },
						{ label: 'Amount', align: 'end' },
						{ label: 'Status' },
						{ label: 'Payment' },
					]
				}>
				{
					props.items.map((d) => (
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
		</CreatorListFrame>
	)
}

/** `May 19, 2026 12:30:05` (UTC) from an ISO timestamp. */
function when(iso: string) {
	return `${formatDate(iso)} ${iso.slice(11, 19)}`
}
