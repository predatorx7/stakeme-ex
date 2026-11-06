import { escapeText } from '../../utils/escape.ts'
import { formatTokens, formatUsdc } from '../../utils/money.ts'
import type { BadgeTone } from '../../utils/tones.ts'
import { Badge } from '../Badge.tsx'
import { ProofCountdown } from './ProofCountdown.tsx'

type Range = { low: string, high: string }

/** The slice of `market` (docs/instrument-view.md) this component reads. */
export type InstrumentStatsMarket = {
	quote: { price: string, change24h: string, changePct24h: string }
	ohlc24h: { open: string, high: string, low: string, close: string }
	dayRange: Range
	sinceIpoRange: Range
	volume24h: string
	vwap24h: string | null
	trades24h: number
	fundamentals?: { nextProofDueAt: string | null }
	status: {
		kind: 'LIVE' | 'GRACE' | 'FROZEN' | 'DEFAULTED' | 'COMPLETED'
		label: string
		tradingHalted: boolean
	}
}

const DASH = '—'
const PRICE_DIGITS = 6

const STATUS: Record<
	InstrumentStatsMarket['status']['kind'],
	{ tone: BadgeTone, text: string }
> = {
	LIVE: { tone: 'success', text: 'Live' },
	GRACE: { tone: 'warn', text: 'Grace period' },
	FROZEN: { tone: 'warn', text: 'Escrow frozen' },
	DEFAULTED: { tone: 'danger', text: 'Defaulted · trading halted' },
	COMPLETED: { tone: 'info', text: 'Completed' },
}

function usdc(value: string | null | undefined) {
	return value === null || value === undefined
		? DASH
		: formatUsdc(value, PRICE_DIGITS)
}

function money(value: string | null | undefined) {
	return value === null || value === undefined ? DASH : formatUsdc(value)
}

function count(value: number | null | undefined) {
	return value === null || value === undefined
		? DASH
		: formatTokens(value, 0)
}

/** Marker position along a range, 0-100, or null when it can't be placed. */
function position(price: number, { low, high }: Range) {
	const lo = Number(low)
	const hi = Number(high)
	if(!Number.isFinite(price) || !Number.isFinite(lo) || !Number.isFinite(hi)) {
		return null
	}

	if(hi <= lo) {
		return 50
	}

	return Math.min(100, Math.max(0, ((price - lo) / (hi - lo)) * 100))
}

function RangeBar({ label, range, price }: {
	label: string
	range: Range | null
	price: number
}) {
	const pos = range ? position(price, range) : null
	return (
		<div class='instrument-range'>
			<span class='instrument-range__title'>
				{escapeText(label)}
			</span>
			<span class='instrument-range__low'>
				{escapeText(usdc(range?.low))}
			</span>
			<span
				class='instrument-range__bar'
				role='img'
				aria-label={
					`${label}: current price at ${
						pos === null ? 'unknown position' : `${Math.round(pos)}% of range`
					}`
				}>
				{
					pos !== null && (
						<i
							class='instrument-range__marker'
							style={`left:${pos.toFixed(2)}%`} />
					)
				}
			</span>
			<span class='instrument-range__high'>
				{escapeText(usdc(range?.high))}
			</span>
		</div>
	)
}

/**
 * Quote header, day statistics, range bars and the trading status pill.
 * The price element carries `data-price-flash` and `data-price` for the
 * client price-flash module.
 */
export function InstrumentStats({ market }: { market: InstrumentStatsMarket }) {
	const { quote, ohlc24h, status } = market
	const change = Number(quote.change24h)
	const pct = Number(quote.changePct24h)
	const dir = change > 0 ? 'up' : change < 0 ? 'down' : 'flat'
	const sign = change > 0 ? '+' : ''
	const price = Number(quote.price)
	const raising = status.kind === 'LIVE' && status.tradingHalted
	const st = raising
		? { tone: 'info' as const, text: 'Raise open' }
		: STATUS[status.kind]
	const stats: [string, string][] = [
		['Open', usdc(ohlc24h.open)],
		['High', usdc(ohlc24h.high)],
		['Low', usdc(ohlc24h.low)],
		['Prev close', usdc(ohlc24h.close)],
		['Volume (24h)', money(market.volume24h)],
		['Avg price (VWAP)', usdc(market.vwap24h)],
		['Trades (24h)', count(market.trades24h)],
	]

	return (
		<section
			class='instrument-stats'
			aria-label='Quote and day statistics'>
			<header class='instrument-quote'>
				<strong
					class='instrument-quote__price'
					data-price-flash
					data-price={quote.price}
					data-price-key='instrument-quote'>
					{escapeText(usdc(quote.price))}
				</strong>
				<span
					class='instrument-quote__change'
					data-dir={dir}>
					{
						escapeText(
							Number.isFinite(change) && Number.isFinite(pct)
								? `${sign}${formatUsdc(change, PRICE_DIGITS)} `
									+ `(${sign}${pct.toFixed(2)}%)`
								: DASH,
						)
					}
				</span>
				<span title={status.label}>
					<Badge tone={st.tone}>
						{escapeText(st.text)}
					</Badge>
				</span>
				<ProofCountdown
					dueAt={market.fundamentals?.nextProofDueAt}
					status={status.kind} />
			</header>
			<dl class='instrument-grid'>
				{
					stats.map(([label, value]) => (
						<div class='instrument-grid__item'>
							<dt>
								{escapeText(label)}
							</dt>
							<dd>
								{escapeText(value)}
							</dd>
						</div>
					))
				}
			</dl>
			<RangeBar
				label='Day range'
				range={market.dayRange}
				price={price} />
			<RangeBar
				label='Since IPO'
				range={market.sinceIpoRange}
				price={price} />
		</section>
	)
}
