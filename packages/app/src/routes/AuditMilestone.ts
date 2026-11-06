import { conflict } from '@hapi/boom'
import assert from 'node:assert'
import type { ITypedExpressRequest } from '../types/openapi.ts'
import { runIncomeAudit } from '../utils/income-audit.ts'

/** `POST /api/audit-milestone` — verify, audit and apply a Reclaim proof. */
export default async function AuditMilestone(
	req: ITypedExpressRequest<'AuditMilestone'>,
) {
	const out = await runIncomeAudit(req.pg, req.body)
	assert(out.kind === 'audited', conflict('Session already finished'))
	req.res!.status(201).json(out.result)
}
