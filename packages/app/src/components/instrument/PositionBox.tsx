import { escapeText } from '../../utils/escape.ts'
import { formatTokens, formatUsdc } from '../../utils/money.ts'
import { SectionCard } from '../SectionCard.tsx'

type PositionData = {
	tokens: string
	avgCost: string
	value: string
	pnl: string
	pnlPct: string
}

/** The signed-in viewer's holding. Renders nothing when signed out. */
export function PositionBox({ position, ticker, signedIn }: {
	position: PositionData | null
	ticker: string
	signedIn: boolean
}) {
	if(!signedIn) {
		return ''
	}

	if(!position) {
		return (
			<SectionCard
				title='Your position'
				level='h3'
				plain>
				<p class='smx-position__empty'>
					{escapeText(`You don't hold $${ticker} yet.`)}
				</p>
			</SectionCard>
		)
	}

	const pnl = Number(position.pnl)
	const pct = Number(position.pnlPct)
	const dir = pnl > 0 ? 'up' : pnl < 0 ? 'down' : 'flat'
	const sign = pnl > 0 ? '+' : ''
	return (
		<SectionCard
			title='Your position'
			level='h3'
			plain>
			<dl class='smx-position'>
				<div>
					<dt>
						Tokens
					</dt>
					<dd>
						{escapeText(formatTokens(position.tokens))}
					</dd>
				</div>
				<div>
					<dt title='Average USDC paid per token.'>
						Avg cost
					</dt>
					<dd>
						{escapeText(formatUsdc(position.avgCost, 4))}
					</dd>
				</div>
				<div>
					<dt>
						Value
					</dt>
					<dd>
						{escapeText(formatUsdc(position.value))}
					</dd>
				</div>
				<div>
					<dt title='Gain or loss versus cost, not yet realized.'>
						{escapeText('Unrealized P&L')}
					</dt>
					<dd data-dir={dir}>
						{escapeText(`${sign}${formatUsdc(position.pnl)}`)}
						{' '}
						{escapeText(`(${sign}${pct.toFixed(2)}%)`)}
					</dd>
				</div>
			</dl>
		</SectionCard>
	)
}
