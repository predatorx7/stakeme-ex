import type { ITypedExpressRequest } from '../types/openapi.ts'
import { runIncomeAudit } from '../utils/income-audit.ts'

/** `POST /api/audit-milestone` — verify, audit and apply a Reclaim proof. */
export default async function AuditMilestone(
	req: ITypedExpressRequest<'AuditMilestone'>,
) {
	const result = await runIncomeAudit(req.pg, req.body)
	req.res!.status(201).json(result)
}
