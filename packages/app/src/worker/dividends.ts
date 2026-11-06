import { streamDividend } from '../integrations/index.ts'
import { getContractForCreator, saveDividendReceipts } from '../queries.ts'
import type { IPgClientLike } from '../types/index.ts'

export type DividendPaidPayload = {
	creator_id: string
	kind: string
	payload: {
		dividendId?: string
		splits?: Array<{ wallet: string, amount: string }>
	}
}

/**
 * Streams a paid dividend to holders (Hedera x402 or simulated) and stores
 * the receipts. Called for each `DIVIDEND_PAID` oracle event row; other kinds
 * are ignored. Throws on failure so pgmb retries with backoff.
 */
export async function streamPaidDividend(
	pg: IPgClientLike,
	row: DividendPaidPayload,
) {
	const { dividendId, splits } = row.payload
	if(row.kind !== 'DIVIDEND_PAID' || !dividendId || !splits?.length) {
		return false
	}

	const [creator] = await getContractForCreator.run(
		{ creator_id: row.creator_id }, pg,
	)
	const result = await streamDividend({
		dividendId,
		contractAddress: creator?.contract_address ?? null,
		splits,
	})
	await saveDividendReceipts.run(
		{
			dividend_id: dividendId,
			receipts: { status: result.status, receipts: result.receipts },
		},
		pg,
	)
	return true
}
