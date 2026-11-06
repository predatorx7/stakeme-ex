import {
	badRequest,
	Boom,
	forbidden,
	isBoom,
	notFound,
	tooManyRequests,
	unauthorized,
} from '@hapi/boom'
import assert from 'node:assert'
import { DEMO_MODE, DEMO_PROOFS_PER_HOUR } from '../consts.ts'
import { readDeliveryEnvelope } from '../integrations/reclaim.ts'
import { field } from '../integrations/util.ts'
import {
	reportingWindow,
	ZeroGAuditUnavailable
} from '../integrations/zero-g.ts'
import { LOGGER } from '../logger.ts'
import {
	auditIncomeProof,
	finishReclaimSession,
	getDemoProofQuota,
	getReclaimSession,
	markAuditUnavailable,
	submitIncomeProof,
} from '../queries.ts'
import { createOracle } from '../services/index.ts'
import type { IPgClientLike } from '../types/index.ts'
import { unwrapProofBody } from './proof-body.ts'

const UUID_REGEX =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type IncomeAuditOutcome =
	/** Verified, stored and audited: the SQL-built `AuditResult`. */
	| { kind: 'audited', result: unknown }
	/** 0G was unreachable: the proof stays PENDING (`audit.status`). */
	| { kind: 'unavailable', result: unknown }
	/** The session already finished; a redelivery changes nothing. */
	| { kind: 'duplicate', status: string }
	/** A failure event (rejected, error, cancelled, expired) was recorded. */
	| { kind: 'failed', status: string }

/**
 * The pipeline behind `AuditMilestone` and `ReclaimCallback`: verify the
 * delivery through the oracle, store the proof PENDING, let the 0G agent
 * audit it, then `audit_income_proof` decides and queues the audit log's 0G
 * Storage upload (the proof commits with a `local:<sha256>` log ref). When no
 * 0G auditor answers, the proof stays PENDING ("0G audit unavailable"). The
 * expected session, org and creator come from our own `reclaim_sessions`
 * row, never from the body.
 */
export async function runIncomeAudit(
	pg: IPgClientLike,
	rawBody: unknown,
	/**
	 * Demo fixtures (`demo: true`) are accepted only with `demoViewerId`, the
	 * signed-in owner of the creator (the Hub's demo button). Reclaim
	 * deliveries never pass it, so they can't carry fixtures.
	 */
	opts: { demoViewerId?: string } = {},
): Promise<IncomeAuditOutcome> {
	const body = demoFixtureOf(unwrapProofBody(rawBody))
	const oracle = createOracle()
	const isDemo = field(body, 'demo') === true

	let creatorId: string
	let sessionId: string | undefined
	let orgId: string | null = null
	if(isDemo) {
		const context = field(body, 'context')
		assert(
			typeof context === 'string',
			badRequest('Proof does not name a creator'),
		)
		creatorId = context
		await assertDemoProofAllowed(pg, creatorId, opts.demoViewerId)
	} else {
		const hint = field(body, 'sessionId')
		assert(typeof hint === 'string', badRequest('Delivery has no session id'))
		const [session] = await getReclaimSession.run({ id: hint }, pg)
		assert(session, notFound('Unknown Reclaim session'))
		creatorId = session.creator_id
		sessionId = session.id
		orgId = session.org_id

		const { failure } = readDeliveryEnvelope(body)
		if(failure) {
			await finishReclaimSession.run(
				{ id: session.id, status: failure, reason: `Reclaim: ${failure}` },
				pg,
			)
			return { kind: 'failed', status: failure }
		}

		if(session.status !== 'PENDING') {
			return { kind: 'duplicate', status: session.status }
		}
	}

	assert(
		UUID_REGEX.test(creatorId),
		badRequest('Proof does not name a creator'),
	)
	let income: Awaited<ReturnType<typeof oracle.fetchVerifiedIncome>>
	try {
		income = await oracle.fetchVerifiedIncome({
			body, sessionId, orgId, creatorId,
		})
	} catch(err) {
		const boom = isBoom(err) ? err : new Boom('Proof could not be verified', {
			statusCode: 400,
		})
		if(!isBoom(err)) {
			LOGGER.warn({ err }, 'income proof failed verification')
		}

		// 5xx means a retry may succeed; anything else ends the session.
		if(sessionId && boom.output.statusCode < 500) {
			await finishReclaimSession.run(
				{ id: sessionId, status: 'ERROR', reason: boom.message },
				pg,
			)
		}

		throw boom
	}

	const [pending] = await submitIncomeProof.run(
		{
			creator_id: creatorId,
			provider: income.provider,
			reclaim_proof_id: income.proofId,
			amount: income.amount,
			raw: income.raw,
			reclaim_session_id: sessionId ?? null,
		},
		pg,
	)
	let audit: Awaited<ReturnType<typeof oracle.audit>>
	try {
		audit = await oracle.audit({
			creatorId,
			ticker: pending.ticker,
			shareBps: pending.share_bps,
			minIncome: pending.min_income,
			period: pending.period,
			termsHash: pending.terms_hash ?? '',
			termsRef: pending.terms_ref ?? undefined,
			window: reportingWindow(
				'proof_cadence' in pending && pending.proof_cadence === 'QUARTERLY'
					? 90
					: 30,
			),
			income,
		})
	} catch(err) {
		if(!(err instanceof ZeroGAuditUnavailable)) {
			throw err
		}

		// No 0G auditor, no sign-off: keep the proof PENDING so it can be retried.
		const [held] = await markAuditUnavailable.run(
			{ proof_id: pending.id, message: err.message.slice(0, 300) },
			pg,
		)
		return { kind: 'unavailable', result: held.j }
	}

	const [row] = await auditIncomeProof.run(
		{
			proof_id: pending.id,
			verified_amount: audit.verifiedAmount,
			audit: {
				approved: audit.approved,
				reasoning: audit.reasoning,
				model: audit.model,
				logRef: audit.logRef,
				engine: audit.engine,
				requestId: audit.requestId,
				providerAddress: audit.providerAddress,
				teeVerified: audit.teeVerified,
				trustMode: audit.trustMode,
				costMicroUsd: audit.costMicroUsd,
			},
			log_document: audit.logDocument,
		},
		pg,
	)
	return { kind: 'audited', result: row.j }
}

/**
 * The Hub's demo button sends `{ ticker, period, proof: <fixture> }`, while a
 * Reclaim delivery is the envelope itself. Lift a nested demo fixture so both
 * shapes reach the same pipeline; anything else passes through unchanged.
 */
function demoFixtureOf(body: unknown): unknown {
	const proof = field(body, 'proof')
	return field(proof, 'demo') === true ? proof : body
}

/** Demo proofs: DEMO_MODE, a signed-in owner, and the hourly creator cap. */
async function assertDemoProofAllowed(
	pg: IPgClientLike,
	creatorId: string,
	viewerId: string | undefined,
) {
	assert(DEMO_MODE, forbidden('Demo proofs need DEMO_MODE=1'))
	assert(viewerId, unauthorized('Sign in as the creator for a demo proof'))
	assert(
		UUID_REGEX.test(creatorId),
		badRequest('Proof does not name a creator'),
	)
	const [quota] = await getDemoProofQuota.run(
		{ creator_id: creatorId, viewer_id: viewerId }, pg,
	)
	assert(
		quota.is_owner,
		forbidden('Only the creator can submit demo proofs'),
	)
	assert(
		quota.recent < DEMO_PROOFS_PER_HOUR,
		tooManyRequests(
			`At most ${DEMO_PROOFS_PER_HOUR} demo proofs per creator per hour`,
		),
	)
}
