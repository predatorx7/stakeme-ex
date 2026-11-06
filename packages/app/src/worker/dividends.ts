import { HEDERA_OPERATOR_PAYOUT } from '../consts.ts'
import { LOGGER } from '../logger.ts'
import { getPaidDividendReceipts } from '../queries.ts'
import { createPaymentService, isHederaRailLive } from '../services/index.ts'
import type { IPgClientLike } from '../types/index.ts'

export type DividendPaidPayload = {
	creator_id: string
	kind: string
	payload: {
		ticker?: string
		dividendId?: string
		amount?: string
		splits?: Array<{ wallet: string, amount: string }>
	}
}

/**
 * Pays a dividend to holders over the payment rail and stores the receipts.
 * Called for each `DIVIDEND_PAID` oracle event row; other kinds are ignored,
 * and so are dividends the creator already settled through the x402 loop.
 * With live Hedera keys it pays from the operator only when
 * `HEDERA_OPERATOR_PAYOUT=1`.
 * Throws on failure so pgmb retries with backoff.
 */
export async function streamPaidDividend(
	pg: IPgClientLike,
	row: DividendPaidPayload,
) {
	const { dividendId, splits, amount, ticker } = row.payload
	if(
		row.kind !== 'DIVIDEND_PAID' || !dividendId || !splits?.length || !amount
	) {
		return false
	}

	// With live keys the worker would spend the operator's own HBAR. That needs
	// an explicit opt-in; the creator's signed payment is the normal path.
	if(isHederaRailLive() && !HEDERA_OPERATOR_PAYOUT) {
		LOGGER.info({ dividendId }, 'operator payout off: dividend not streamed')
		return false
	}

	const [state] = await getPaidDividendReceipts.run(
		{ dividend_id: dividendId }, pg,
	)
	if(state?.settled) {
		return false
	}

	await createPaymentService(pg).payDividend({
		id: dividendId,
		creatorId: row.creator_id,
		ticker: ticker ?? '',
		amountDue: amount,
		splits,
	})
	return true
}
