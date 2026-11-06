import { conflict } from '@hapi/boom'
import assert from 'node:assert'
import { payDividend } from '../queries.ts'
import { createPaymentService, hashscanTxUrl } from '../services/index.ts'
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
	// `dividends.paid_tx_hash` holds 0x hashes only. A Hedera transaction id
	// (`0.0.x@s.n`) lives in the stored receipts and in this response.
	let settlement: Record<string, string> | undefined
	if(paymentPayload) {
		const dividend = await loadPayableDividend(
			req.pg, req.params.dividendId, viewerId,
		)
		assert(dividend.status === 'DUE', conflict('Dividend was already paid'))
		const settled = await createPaymentService(req.pg)
			.settle(dividend, paymentPayload)
		const txId = settled.receipts[0]?.split('#')[0]
		settlement = { status: settled.status }
		if(txId && settled.status === 'CONFIRMED') {
			settlement.txId = txId
			settlement.hashscanUrl = hashscanTxUrl(txId)
		}
	}

	const [row] = await payDividend.run(
		{
			dividend_id: req.params.dividendId,
			viewer_id: viewerId,
			tx_hash: null,
		},
		req.pg,
	)
	respondMutation(req, req.res!, {
		// Cast: `dividend_json` builds a JSON object.
		body: settlement ? { ...row.j as object, settlement } : row.j,
		trigger: 'smx:dividend-paid',
	})
}
