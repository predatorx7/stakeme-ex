# Instrument view

The creator token page (`/creators/{ticker}`) works like a broker's instrument
screen: quote, depth, day statistics, chart intervals, an order ticket with a
cost estimate, your position, fundamentals, and a corporate-actions timeline.
SMX trades against a constant-product pool, not an order book, so depth is
derived from the pool curve and limit orders aren't offered.

## Data contract

`GET /creators/{ticker}` (JSON) gains a `market` object. Components take
these shapes as props; amounts are decimal strings, times ISO 8601.

```ts
type Market = {
	quote: { price: string, change24h: string, changePct24h: string }
	ohlc24h: { open: string, high: string, low: string, close: string }
	dayRange: { low: string, high: string }
	sinceIpoRange: { low: string, high: string }
	volume24h: string          // USDC traded in 24 h
	vwap24h: string | null     // volume-weighted average price, 24 h
	trades24h: number
	pool: { usdcReserve: string, tokenReserve: string, feeBps: number }
	depth: {                   // from the pool curve, sizes in USDC
		bids: DepthLevel[]       // selling tokens for this much USDC
		asks: DepthLevel[]       // buying tokens with this much USDC
	}
	status: {
		kind: 'LIVE' | 'GRACE' | 'FROZEN' | 'DEFAULTED' | 'COMPLETED'
		label: string            // for example "Escrow frozen: proof overdue"
		tradingHalted: boolean
	}
	fundamentals: {
		marketCap: string        // price × circulating supply
		supply: string
		shareBps: number
		termMonths: number
		termLeftMonths: number
		verifiedIncomeTotal: string
		dividendsPaidTotal: string
		nextProofDueAt: string | null
		holders: number
	}
	position: null | {         // the signed-in viewer's holding
		tokens: string
		avgCost: string          // USDC per token
		value: string            // tokens × price
		pnl: string
		pnlPct: string
	}
	corporateActions: Array<{
		at: string
		kind: 'IPO' | 'PROOF_VERIFIED' | 'PROOF_REJECTED' | 'TRANCHE_RELEASED'
			| 'DIVIDEND_PAID' | 'ESCROW_FROZEN' | 'ESCROW_UNFROZEN' | 'DEFAULTED'
		label: string
		amount: string | null
	}>
}

type DepthLevel = {
	sizeUsdc: string           // 100, 500, 1000, 5000
	tokens: string             // tokens received (asks) or sold (bids)
	avgPrice: string
	impactPct: string          // vs current price
}
```

Candles: `GET /creators/{ticker}/candles?interval=1H|1D|1W|ALL` returns
`{ items: Array<{ t: string, o: string, h: string, l: string, c: string, v: string }> }`.

Watchlist (signed in): `GET /watchlist`, `PUT /watchlist/{ticker}`,
`DELETE /watchlist/{ticker}`.

## Components and owners

| Component | File | Styles |
| --- | --- | --- |
| Market depth ladder | `components/instrument/MarketDepth.tsx` | `instrument-depth.css` |
| Quote, OHLC, ranges, volume, VWAP, status | `components/instrument/InstrumentStats.tsx` | `instrument-stats.css` |
| Fundamentals | `components/instrument/Fundamentals.tsx` | `instrument-fundamentals.css` |
| Your position | `components/instrument/PositionBox.tsx` | `instrument-position.css` |
| Corporate actions | `components/instrument/CorporateActions.tsx` | `instrument-actions.css` |
| Order ticket with estimate | `components/instrument/OrderTicket.tsx`, `client/order-estimate.ts` | `instrument-ticket.css` |
| Chart intervals and candles | `components/charts/CandleChart.tsx`, `client/chart-interval.ts` | `instrument-chart.css` |
| Watchlist drawer | `components/instrument/Watchlist.tsx`, `client/watchlist.ts` | `instrument-watchlist.css` |
| Price flash | `client/price-flash.ts` | `instrument-flash.css` |
