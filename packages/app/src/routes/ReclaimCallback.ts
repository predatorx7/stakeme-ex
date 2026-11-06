import type { ITypedExpressRequest } from '../types/openapi.ts'
import { runIncomeAudit } from '../utils/income-audit.ts'

/**
 * `POST /reclaim/callback` — Reclaim posts the proof here. Same pipeline as
 * `AuditMilestone`; the proof's signature is the only credential.
 */
export default async function ReclaimCallback(
	req: ITypedExpressRequest<'ReclaimCallback'>,
) {
	const result = await runIncomeAudit(req.pg, req.body)
	req.res!.status(201).json(result)
}
