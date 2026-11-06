import { conflict } from '@hapi/boom'
import assert from 'node:assert'
import type { ITypedExpressRequest } from '../types/openapi.ts'
import { runIncomeAudit } from '../utils/income-audit.ts'

/** `POST /api/audit-milestone` — verify, audit and apply a Reclaim proof. */
export default async function AuditMilestone(
	req: ITypedExpressRequest<'AuditMilestone'>,
) {
	const out = await runIncomeAudit(req.pg, req.body, {
		demoViewerId: req.authMetadata?.id,
	})
	assert(
		out.kind === 'audited' || out.kind === 'unavailable',
		conflict('Session already finished'),
	)
	// 202: accepted, but still PENDING because 0G could not audit it yet.
	req.res!.status(out.kind === 'audited' ? 201 : 202).json(out.result)
}
