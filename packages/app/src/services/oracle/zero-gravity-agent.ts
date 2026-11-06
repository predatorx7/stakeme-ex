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
import type { IStorageProvider } from '../storage/storage-provider.ts'
import type { IOracle, OracleProofPayload } from './oracle.ts'

/**
 * The SMX auditor agent. As an `IOracle` it opens Reclaim zkTLS sessions and
 * verifies their results (`@reclaimprotocol/client`). `audit()` runs the
 * income decision on 0G Compute and writes the approve/deny log to storage
 * (0G Storage Log Layer by default); the SQL rules engine has the last word.
 */
export class ZeroGravityAgent implements IOracle {

	readonly name = '0g-agent'
	readonly #storage: IStorageProvider

	constructor(storage: IStorageProvider) {
		this.#storage = storage
	}

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

	/** Audits verified income and stores the log (`logRef`). */
	async audit(input: IncomeAuditInput): Promise<IncomeAudit> {
		const { verdict, model, provider, teeVerified } =
			await runAuditVerdict(input)
		const { ref } = await this.#storage.putJson({
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
		return { ...verdict, model, logRef: ref }
	}

}

function isProofPayload(v: unknown): v is OracleProofPayload {
	return typeof field(v, 'creatorId') === 'string'
		&& field(v, 'body') !== undefined
}
