import type { TickerItem } from '../components/TickerStrip.tsx'
import { LOGGER } from '../logger.ts'
import { getExchange } from '../queries.ts'
import type { Exchange, IPgClientLike } from '../types/index.ts'
import { typed } from './json.ts'

const TTL_MS = 10_000
const LIMIT = 12

// Shared through `globalThis`: dev may load route modules separately from the
// app entry, which would give each its own copy of module state.
const state = (globalThis as { __smxTicker?: {
	items: TickerItem[]
	loadedAt: number
	inflight?: Promise<void>
} }).__smxTicker ??= { items: [], loadedAt: 0 }

/** Last loaded ticker items. Synchronous, so `Layout` can read it. */
export function tickerItems() {
	return state.items
}

/** Refreshes the cache when older than 10s. Never throws. */
export function warmTicker(pg: IPgClientLike) {
	if(Date.now() - state.loadedAt < TTL_MS) {
		return Promise.resolve()
	}

	state.inflight ||= load(pg).finally(() => {
		state.inflight = undefined
	})
	return state.inflight

	async function load(client: IPgClientLike) {
		try {
			const [row] = await getExchange.run({ limit: LIMIT }, client)
			state.items = typed<Exchange>(row.j).trending
				.filter((c) => c.status === 'LIVE' || c.status === 'GRACE')
				.map(({ ticker, price, change24h }) => ({ ticker, price, change24h }))
		} catch(err) {
			LOGGER.warn({ err }, 'ticker feed refresh failed')
		}

		state.loadedAt = Date.now()
	}
}
