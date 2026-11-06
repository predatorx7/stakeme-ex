import { escapeHtml } from '@kitajs/html'
import { escapeText } from '../../utils/escape.ts'
import { formatTokens, formatUsdc } from '../../utils/money.ts'
import { SectionCard } from '../SectionCard.tsx'

type DepthLevel = {
	sizeUsdc: string
	tokens: string
	avgPrice: string
	impactPct: string
}

type Depth = { bids: DepthLevel[], asks: DepthLevel[] }

/**
 * Two-sided depth ladder from the pool curve: sell (bids) on the left, buy
 * (asks) on the right. Each row's bar is scaled to the largest impact shown.
 */
export function MarketDepth({ depth, quote }: {
	depth: Depth
	quote: { price: string }
}) {
	const impact = (level: DepthLevel) => Math.abs(Number(level.impactPct)) || 0
	const maxImpact = Math.max(
		...depth.bids.map(impact),
		...depth.asks.map(impact),
	)

	return (
		<SectionCard
			id='market-depth'
			title='Market depth'
			context={`Current price ${formatUsdc(quote.price, 6)}`}
			footer={
				<p>
					Depth from the liquidity pool: price impact for each trade size.
				</p>
			}>
			<div class='depth-ladder'>
				<Side
					side='sell'
					caption='Sell: tokens sold for each trade size'
					tokensLabel='Tokens sold'
					levels={depth.bids} />
				<Side
					side='buy'
					caption='Buy: tokens received for each trade size'
					tokensLabel='Tokens bought'
					levels={depth.asks} />
			</div>
		</SectionCard>
	)

	function Side({ side, caption, tokensLabel, levels }: {
		side: 'sell' | 'buy'
		caption: string
		tokensLabel: string
		levels: DepthLevel[]
	}) {
		const sign = side === 'sell' ? '-' : '+'
		return (
			<table
				class='depth-side'
				data-side={side}>
				<caption>
					{escapeHtml(caption)}
				</caption>
				<thead>
					<tr>
						<th scope='col'>
							Size
						</th>
						<th scope='col'>
							{escapeHtml(tokensLabel)}
						</th>
						<th scope='col'>
							Avg price
						</th>
						<th scope='col'>
							Impact
						</th>
					</tr>
				</thead>
				<tbody>
					{
						levels.length
							? levels.map((level) => (
								<tr
									style={
										`--depth-bar:${
											maxImpact
												? Math.min(100, (impact(level) / maxImpact) * 100)
													.toFixed(1)
												: '0'
										}%`
									}>
									<th scope='row'>
										{escapeText(formatUsdc(level.sizeUsdc))}
									</th>
									<td>
										{escapeText(formatTokens(level.tokens))}
									</td>
									<td>
										{escapeText(formatUsdc(level.avgPrice, 6))}
									</td>
									<td>
										{escapeText(`${sign}${impact(level).toFixed(2)}%`)}
									</td>
								</tr>
							))
							: (
								<tr>
									<td colspan='4'>
										No depth available.
									</td>
								</tr>
							)
					}
				</tbody>
			</table>
		)
	}
}
