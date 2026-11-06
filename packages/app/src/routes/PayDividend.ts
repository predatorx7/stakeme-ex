import { conflict } from '@hapi/boom'
import assert from 'node:assert'
import { payDividend } from '../queries.ts'
import { createPaymentService } from '../services/index.ts'
import type { ITypedExpressRequest } from '../types/openapi.ts'
import { loadPayableDividend } from '../utils/dividend-payment.ts'
import { respondMutation } from '../utils/mutation.ts'

/**
 * `POST /dividends/{dividendId}/payment` — the creator pays a dividend. With a
 * `paymentPayload` (the transaction their wallet signed for the x402 request)
 * the payment rail settles it first; otherwise the worker pays holders from
 * the platform on `DIVIDEND_PAID`.
 */
export default async function PayDividendRoute(
	req: ITypedExpressRequest<'PayDividend'>,
) {
	const viewerId = req.authMetadata!.id
	const paymentPayload = req.body?.paymentPayload
	let txHash: string | null = null
	if(paymentPayload) {
		const dividend = await loadPayableDividend(
			req.pg, req.params.dividendId, viewerId,
		)
		assert(dividend.status === 'DUE', conflict('Dividend was already paid'))
		const settled = await createPaymentService(req.pg)
			.settle(dividend, paymentPayload)
		txHash = settled.receipts[0] ?? null
	}

	const [row] = await payDividend.run(
		{
			dividend_id: req.params.dividendId,
			viewer_id: viewerId,
			tx_hash: txHash,
		},
		req.pg,
	)
	respondMutation(req, req.res!, { body: row.j, trigger: 'smx:dividend-paid' })
}
