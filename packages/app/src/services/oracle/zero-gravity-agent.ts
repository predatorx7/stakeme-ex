import { badRequest } from '@hapi/boom'
import assert from 'node:assert'
import {
	createReclaimSession,
	getReclaimSessionStatus,
	verifyDemoProof,
	verifyReclaimDelivery,
} from '../../integrations/reclaim.ts'
import type {
	IncomeAudit,
	IncomeAuditInput,
	ReclaimSessionInput,
} from '../../integrations/types.ts'
import { field } from '../../integrations/util.ts'
import { RULES_MODEL, runAuditVerdict } from '../../integrations/zero-g.ts'
import { prepareStorage } from '../storage/storage-document.ts'
import type { IOracle, OracleProofPayload } from './oracle.ts'

/** An audit plus the log document the storage outbox uploads later. */
export type OracleAudit = IncomeAudit & { logDocument: object }

/**
 * The SMX auditor agent. As an `IOracle` it opens Reclaim zkTLS sessions and
 * verifies their results (`@reclaimprotocol/client`). `audit()` runs the
 * income decision on 0G Compute; the SQL rules engine has the last word. The
 * approve/deny log is prepared synchronously (`logRef` = `local:<sha256>`);
 * the caller hands `logDocument` to `audit_income_proof`, which queues the 0G
 * Storage upload.
 */
export class ZeroGravityAgent implements IOracle {

	readonly name = '0g-agent'

	createProofRequest(input: ReclaimSessionInput) {
		return createReclaimSession(input)
	}

	getProofRequestStatus(sessionId: string) {
		return getReclaimSessionStatus(sessionId)
	}

	async fetchVerifiedIncome(payload: unknown) {
		assert(
			isProofPayload(payload),
			badRequest('Invalid oracle payload'),
		)
		if(field(payload.body, 'demo') === true) {
			const income = verifyDemoProof(payload.body)
			assert(
				income.context === payload.creatorId,
				badRequest('Demo proof names another creator'),
			)
			return income
		}

		assert(payload.sessionId, badRequest('Unknown Reclaim session'))
		return verifyReclaimDelivery(payload.body, {
			sessionId: payload.sessionId,
			orgId: payload.orgId ?? null,
			creatorId: payload.creatorId,
		})
	}

	/** Audits verified income and prepares the log (local `logRef`). */
	async audit(input: IncomeAuditInput): Promise<OracleAudit> {
		const { verdict, model, provider, teeVerified } =
			await runAuditVerdict(input)
		const { document, localRef } = prepareStorage({
			kind: 'AUDIT_LOG',
			key: `audit/${input.ticker}/${input.period}/${input.income.proofId}`,
			data: {
				version: 1,
				engine: model === RULES_MODEL ? 'rules' : '0g-compute',
				model,
				provider,
				teeVerified,
				ticker: input.ticker,
				period: input.period,
				termsHash: input.termsHash,
				termsRef: input.termsRef ?? null,
				proofId: input.income.proofId,
				depositAmount: input.income.amount,
				minIncome: input.minIncome,
				verdict,
			},
			attributes: {
				ticker: input.ticker,
				period: input.period,
				approved: verdict.approved ? 1 : 0,
			},
		})
		return { ...verdict, model, logRef: localRef, logDocument: document }
	}

}

function isProofPayload(v: unknown): v is OracleProofPayload {
	return typeof field(v, 'creatorId') === 'string'
		&& field(v, 'body') !== undefined
}
