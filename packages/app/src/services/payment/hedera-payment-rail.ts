import { formatUnits } from 'viem'
import type { DividendSplit } from '../../integrations/types.ts'
import {
	createHederaPaymentRequest,
	payoutFromOperator,
	settleHederaPayment,
} from './hedera-payment-core.ts'
import { toMicro } from './hedera-payment-requirements.ts'
import type {
	IPaymentRail,
	PayableDividend,
	PayoutContext,
} from './payment-service.ts'

/**
 * Default rail: native Hedera transactions, SIMULATED without operator keys.
 *
 * - `createPaymentRequest`: x402 requirements, one per holder.
 * - `settle`: verifies the creator's signed multi-transfer and submits it.
 * - `payout`: the operator pays all holders in one transfer (worker fallback).
 *
 * See docs/integrations/hedera.md.
 */
export class HederaPaymentRail implements IPaymentRail {

	readonly name = 'hedera'

	async payout(splits: DividendSplit[], ctx: PayoutContext) {
		return payoutFromOperator(createHederaPaymentRequest({
			dividendId: ctx.dividendId,
			amount: sumSplits(splits),
			splits,
		}))
	}

	async createPaymentRequest(
		dividend: PayableDividend,
		splits: DividendSplit[],
	) {
		return createHederaPaymentRequest({
			dividendId: dividend.id,
			amount: dividend.amountDue,
			splits,
		})
	}

	async settle(dividend: PayableDividend, paymentPayload: unknown) {
		// Requirements come from the database again, never from the client.
		const request = createHederaPaymentRequest({
			dividendId: dividend.id,
			amount: dividend.amountDue,
			splits: dividend.splits,
		})
		return settleHederaPayment({
			request,
			paymentPayload: paymentPayload && typeof paymentPayload === 'object'
				? paymentPayload as Record<string, unknown>
				: undefined,
		})
	}

}

function sumSplits(splits: DividendSplit[]) {
	const total = splits.reduce((acc, s) => acc + toMicro(s.amount), 0n)
	return formatUnits(total, 6)
}
