import { notFound } from '@hapi/boom'
import assert from 'node:assert'
import { getDividendForPayment } from '../queries.ts'
import type { PayableDividend } from '../services/index.ts'
import type { IPgClientLike } from '../types/index.ts'

/**
 * Loads a dividend the viewer owns, with its holder splits (computed in SQL).
 * 404 when unknown, 403 when it is not theirs.
 */
export async function loadPayableDividend(
	pg: IPgClientLike,
	dividendId: string,
	viewerId: string,
): Promise<PayableDividend & { status: string }> {
	const [row] = await getDividendForPayment.run(
		{ dividend_id: dividendId, viewer_id: viewerId },
		pg,
	)
	assert(row, notFound('Dividend not found'))
	return {
		id: row.id,
		creatorId: row.creator_id,
		ticker: row.ticker,
		amountDue: row.amount_due,
		status: row.status,
		// Cast: `dividend_splits_json` builds exactly this shape.
		splits: row.splits as PayableDividend['splits'],
	}
}
