import { isBoom } from '@hapi/boom'
import { LOGGER } from '../logger.ts'
import type { ITypedExpressRequest } from '../types/openapi.ts'
import { runIncomeAudit } from '../utils/income-audit.ts'

/**
 * `POST /reclaim/callback` — Reclaim delivers results and failure events
 * here. Same pipeline as `AuditMilestone`; the verified result is the only
 * credential. Reclaim retries on 5xx only, so: a temporary verifier problem
 * (`retryable`) answers 503, every other outcome answers 2xx/200.
 */
export default async function ReclaimCallback(
	req: ITypedExpressRequest<'ReclaimCallback'>,
) {
	try {
		const out = await runIncomeAudit(req.pg, req.body)
		if(out.kind === 'audited') {
			req.res!.status(201).json(out.result)
			return
		}

		if(out.kind === 'unavailable') {
			req.res!.status(202).json(out.result)
			return
		}

		req.res!.status(200).json({ status: out.status, kind: out.kind })
	} catch(err) {
		if(isBoom(err) && err.output.statusCode < 500) {
			// Redelivering cannot change the outcome: acknowledge it.
			LOGGER.warn({ err: err.message }, 'reclaim callback rejected')
			req.res!.status(200).json({ status: 'ERROR', kind: 'rejected' })
			return
		}

		throw err
	}
}
