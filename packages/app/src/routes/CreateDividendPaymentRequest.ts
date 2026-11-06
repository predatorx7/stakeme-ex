import { conflict } from '@hapi/boom'
import assert from 'node:assert'
import { createPaymentService } from '../services/index.ts'
import type { ITypedExpressRequest } from '../types/openapi.ts'
import { loadPayableDividend } from '../utils/dividend-payment.ts'

/**
 * `POST /dividends/{dividendId}/payment-request` — the payment requirements
 * (x402) the creator's wallet signs to pay every holder.
 */
export default async function CreateDividendPaymentRequest(
	req: ITypedExpressRequest<'CreateDividendPaymentRequest'>,
) {
	const dividend = await loadPayableDividend(
		req.pg, req.params.dividendId, req.authMetadata!.id,
	)
	assert(dividend.status === 'DUE', conflict('Dividend was already paid'))
	const request = await createPaymentService(req.pg)
		.createPaymentRequest(dividend)
	req.res!.status(201).json(request)
}
