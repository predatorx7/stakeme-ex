import { formatDate } from '../../utils/dates.ts'
import { escapeText } from '../../utils/escape.ts'
import { formatTokens, formatUsdc } from '../../utils/money.ts'
import { SectionCard } from '../SectionCard.tsx'

type FundamentalsData = {
	marketCap: string
	supply: string
	shareBps: number
	termMonths: number
	termLeftMonths: number
	verifiedIncomeTotal: string
	dividendsPaidTotal: string
	nextProofDueAt: string | null
	holders: number
}

/** A compact definition-list grid of the creator token's fundamentals. */
export function Fundamentals({ fundamentals: f, ticker, now = Date.now() }: {
	fundamentals: FundamentalsData
	ticker: string
	now?: number
}) {
	const due = f.nextProofDueAt ? Date.parse(f.nextProofDueAt) : NaN
	const hasDue = Number.isFinite(due)
	const overdue = hasDue && due < now
	return (
		<SectionCard
			title='Fundamentals'
			level='h3'
			plain>
			<dl class='smx-fundamentals'>
				<Row
					label='Market cap'
					tip='Price times circulating supply.'
					value={formatUsdc(f.marketCap)} />
				<Row
					label='Supply'
					tip={`Circulating $${ticker} tokens.`}
					value={formatTokens(f.supply, 0)} />
				<Row
					label='Income share'
					tip='Share of the creator income that backs the token.'
					value={`${(f.shareBps / 100).toFixed(2)}%`} />
				<Row
					label='Term left'
					tip='Months remaining of the income term.'
					value={`${f.termLeftMonths} of ${f.termMonths} mo`} />
				<Row
					label='Verified income'
					tip='Income proven to date through verified proofs.'
					value={formatUsdc(f.verifiedIncomeTotal)} />
				<Row
					label='Dividends paid'
					tip='Total USDC paid out to holders so far.'
					value={formatUsdc(f.dividendsPaidTotal)} />
				<div
					class='smx-fundamentals__row'
					data-overdue={overdue ? '' : undefined}>
					<dt title='When the next income proof must be submitted.'>
						Next proof due
					</dt>
					<dd>
						{
							hasDue
								? (
									<time datetime={f.nextProofDueAt ?? undefined}>
										{escapeText(dueText(due - now, f.nextProofDueAt))}
									</time>
								)
								: '—'
						}
					</dd>
				</div>
				<Row
					label='Holders'
					tip='Wallets holding this token.'
					value={f.holders.toLocaleString('en-US')} />
			</dl>
		</SectionCard>
	)
}

function Row({ label, tip, value }: {
	label: string
	tip: string
	value: string
}) {
	return (
		<div class='smx-fundamentals__row'>
			<dt title={tip}>
				{escapeText(label)}
			</dt>
			<dd>
				{escapeText(value)}
			</dd>
		</div>
	)
}

function dueText(diff: number, iso: string | null) {
	return `${relative(diff)} (${formatDate(iso)})`
}

/** `in 5d`, `3h ago`, or `now`. */
function relative(diff: number) {
	const abs = Math.abs(diff)
	const d = Math.floor(abs / 86_400_000)
	const h = Math.floor(abs / 3_600_000)
	const m = Math.floor(abs / 60_000)
	const span = d >= 1 ? `${d}d` : h >= 1 ? `${h}h` : `${m}m`
	return diff < 0 ? `${span} overdue` : `in ${span}`
}
