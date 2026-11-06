import { HEDERA_NETWORK } from '../../consts.ts'
import { saveDividendReceipts } from '../../queries.ts'
import type { IPgClientLike } from '../../types/index.ts'
import { HederaPaymentRail } from './hedera-payment-rail.ts'
import { type IPaymentRail, PaymentService } from './payment-service.ts'

export * from './payment-service.ts'
export { isHederaRailLive } from './hedera-payment-core.ts'

/** HashScan link for a Hedera transaction id (`0.0.x@seconds.nanos`). */
export function hashscanTxUrl(txId: string, network = HEDERA_NETWORK) {
	return `https://hashscan.io/${network}/transaction/${txId}`
}

/**
 * Payment adapter. The default rail is `HederaPaymentRail` (SIMULATED
 * without keys); register another `IPaymentRail` in `createPaymentRail()`
 * below. Receipts are stored on the dividend through SQL.
 */
export function createPaymentService(pg: IPgClientLike) {
	return new PaymentService(createPaymentRail(), async(dividendId, result) => {
		await saveDividendReceipts.run(
			{
				dividend_id: dividendId,
				receipts: { status: result.status, receipts: result.receipts },
			},
			pg,
		)
	})
}

export function createPaymentRail(): IPaymentRail {
	return new HederaPaymentRail()
}
