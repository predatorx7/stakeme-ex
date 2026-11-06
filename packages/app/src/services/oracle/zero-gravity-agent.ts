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
import {
	type AuditDeps,
	ROUTER_PROVIDER,
	RULES_MODEL,
	runAuditVerdict,
} from '../../integrations/zero-g.ts'
import { prepareStorage } from '../storage/storage-document.ts'
import type { IOracle, OracleProofPayload } from './oracle.ts'

/** An audit plus the log document the storage outbox uploads later. */
export type OracleAudit = IncomeAudit & { logDocument: object }

/**
 * The SMX auditor agent. As an `IOracle` it opens Reclaim zkTLS sessions and
 * verifies their results (`@reclaimprotocol/client`). `audit()` runs the
 * income decision on 0G Private Computer (Router) and throws
 * `ZeroGAuditUnavailable` when no 0G auditor answers; the SQL rules engine
 * has the last word on the numbers. The
 * approve/deny log is prepared synchronously (`logRef` = `local:<sha256>`);
 * the caller hands `logDocument` to `audit_income_proof`, which queues the 0G
 * Storage upload.
 */
export class ZeroGravityAgent implements IOracle {

	readonly name = '0g-agent'

	private readonly deps: AuditDeps

	constructor(deps: AuditDeps = {}) {
		this.deps = deps
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

	/** Audits verified income and prepares the log (local `logRef`). */
	async audit(input: IncomeAuditInput): Promise<OracleAudit> {
		const { verdict, model, provider, teeVerified, routerTrace } =
			await runAuditVerdict(input, this.deps)
		const engine: 'rules' | '0g-router' | '0g-compute' =
			model === RULES_MODEL
				? 'rules'
				: provider === ROUTER_PROVIDER ? '0g-router' : '0g-compute'
		const requestId = routerTrace?.requestId ?? undefined
		const providerAddress = routerTrace?.provider
			?? (engine === '0g-compute' ? provider ?? undefined : undefined)
		const { document, localRef } = prepareStorage({
			kind: 'AUDIT_LOG',
			key: `audit/${input.ticker}/${input.period}/${input.income.proofId}`,
			data: {
				version: 1,
				engine,
				model,
				provider,
				requestId: requestId ?? null,
				providerAddress: providerAddress ?? null,
				teeVerified,
				trustMode: routerTrace?.trustMode ?? null,
				routerTrace: routerTrace ?? null,
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
		return {
			...verdict,
			model,
			logRef: localRef,
			logDocument: document,
			engine,
			requestId,
			providerAddress,
			teeVerified: teeVerified ?? undefined,
			trustMode: routerTrace?.trustMode ?? undefined,
			costMicroUsd: routerTrace?.costMicroUsd ?? undefined,
		}
	}

}

function isProofPayload(v: unknown): v is OracleProofPayload {
	return typeof field(v, 'creatorId') === 'string'
		&& field(v, 'body') !== undefined
}
