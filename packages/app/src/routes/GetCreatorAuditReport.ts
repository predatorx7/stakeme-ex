import { notFound, serverUnavailable } from '@hapi/boom'
import { HTTPFacilitatorClient } from '@x402/core/server'
import assert from 'node:assert'
import {
	canonicalOrigin,
	HEDERA_ACCOUNT_ID,
	HEDERA_NETWORK,
} from '../consts.ts'
import {
	AUDIT_REPORT_PRICE_TINYBARS,
	type IX402Facilitator,
	readPaymentHeader,
	runPaywall,
} from '../services/payment/x402-paywall.ts'
import type { ITypedExpressRequest } from '../types/openapi.ts'

const FACILITATOR_URL =
	process.env.X402_FACILITATOR_URL || 'https://x402.org/facilitator'
/** Fee payer the official facilitator advertised for hedera:testnet. */
const FALLBACK_FEE_PAYER = '0.0.9185802'

let facilitator: HTTPFacilitatorClient | undefined
let feePayer: string | undefined

/** Test hook: swap the facilitator. */
export const paywallDeps: { facilitator?: IX402Facilitator, feePayer?: string }
	= {}

async function getFeePayer(network: string) {
	if(paywallDeps.feePayer) {
		return paywallDeps.feePayer
	}

	if(feePayer) {
		return feePayer
	}

	facilitator ||= new HTTPFacilitatorClient({ url: FACILITATOR_URL })
	try {
		const supported = await facilitator.getSupported()
		const kind = supported.kinds.find(
			(k) => k.x402Version === 2 && k.scheme === 'exact'
				&& k.network === network,
		)
		const payer = kind?.extra?.feePayer
		feePayer = typeof payer === 'string' ? payer : FALLBACK_FEE_PAYER
	} catch{
		return FALLBACK_FEE_PAYER
	}

	return feePayer
}

/**
 * `GET /creators/{ticker}/audit-report` — x402-gated premium data: the latest
 * 0G audit log and the verified-income history. Pay 0.1 HBAR on Hedera
 * testnet; the x402 facilitator verifies and settles.
 */
export default async function GetCreatorAuditReport(
	req: ITypedExpressRequest<'GetCreatorAuditReport'>,
) {
	const ticker = req.params.ticker
	const { rows: [creator] } = await req.pg.query(
		'SELECT id FROM smx.creators WHERE ticker = $1', [ticker],
	) as { rows: { id: string }[] }
	assert(creator, notFound('Creator not found'))

	const payTo = process.env.X402_PAY_TO || HEDERA_ACCOUNT_ID
	assert(payTo, serverUnavailable('x402 payee is not configured'))
	const network = `hedera:${HEDERA_NETWORK}`
	const res = req.res!
	const result = await runPaywall({
		config: {
			resourceUrl: `${canonicalOrigin()}${req.originalUrl}`,
			description: `Audit report for $${ticker}`,
			network,
			payTo,
			feePayer: await getFeePayer(network),
			amountTinybars: AUDIT_REPORT_PRICE_TINYBARS,
		},
		facilitator: paywallDeps.facilitator
			|| (facilitator ||= new HTTPFacilitatorClient({ url: FACILITATOR_URL })),
		paymentHeader: readPaymentHeader(req.headers),
	})
	res.set(result.headers)
	if(result.status === 402) {
		res.status(402).json(result.body)
		return
	}

	const { rows } = await req.pg.query(
		`SELECT period, status, verified_amount::TEXT AS "verifiedAmount",
			provider, audit, audit_log_ref AS "auditLogRef", created_at AS "at"
		FROM smx.income_proofs WHERE creator_id = $1
		ORDER BY period DESC, created_at DESC`,
		[creator.id],
	) as { rows: Record<string, unknown>[] }
	const latest = rows.find((r) => r.audit) ?? null
	res.json({
		ticker,
		latestAudit: latest && {
			period: latest.period,
			status: latest.status,
			audit: latest.audit,
			auditLogRef: latest.auditLogRef,
			at: latest.at,
		},
		verifiedIncome: rows.map((r) => ({
			period: r.period,
			status: r.status,
			verifiedAmount: r.verifiedAmount,
			provider: r.provider,
			at: r.at,
		})),
		payment: result.settlement,
	} satisfies Record<string, unknown>)
}
