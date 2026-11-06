import { badRequest, Boom } from '@hapi/boom'
import assert from 'node:assert'
import { auditIncome, verifyIncomeProof } from '../integrations/index.ts'
import { LOGGER } from '../logger.ts'
import { auditIncomeProof, submitIncomeProof } from '../queries.ts'
import type { IPgClientLike } from '../types/index.ts'
import { unwrapProofBody } from './proof-body.ts'

const UUID_REGEX =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The shared pipeline behind `AuditMilestone` and `ReclaimCallback`:
 * verify the Reclaim proof, store it PENDING, ask the auditor (0G or the
 * fallback), and let `audit_income_proof` decide. Returns the SQL-built
 * `AuditResult` document.
 */
export async function runIncomeAudit(pg: IPgClientLike, body: unknown) {
	let income: Awaited<ReturnType<typeof verifyIncomeProof>>
	try {
		income = await verifyIncomeProof(unwrapProofBody(body))
	} catch(err) {
		if(err instanceof Boom) {
			throw err
		}

		LOGGER.warn({ err }, 'income proof failed verification')
		throw badRequest('Proof could not be verified')
	}

	assert(
		UUID_REGEX.test(income.context),
		badRequest('Proof does not name a creator'),
	)
	const [pending] = await submitIncomeProof.run(
		{
			creator_id: income.context,
			provider: income.provider,
			reclaim_proof_id: income.proofId,
			amount: income.amount,
			raw: income.raw,
		},
		pg,
	)
	const audit = await auditIncome({
		ticker: pending.ticker,
		shareBps: pending.share_bps,
		minIncome: pending.min_income,
		period: pending.period,
		termsHash: pending.terms_hash ?? '',
		income,
	})
	const [row] = await auditIncomeProof.run(
		{
			proof_id: pending.id,
			verified_amount: audit.verifiedAmount,
			audit: {
				approved: audit.approved,
				reasoning: audit.reasoning,
				model: audit.model,
				logRef: audit.logRef,
			},
		},
		pg,
	)
	return row.j
}
