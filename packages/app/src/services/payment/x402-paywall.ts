import type {
	PaymentPayload,
	PaymentRequired,
	PaymentRequirements,
	SettleResponse,
	VerifyResponse,
} from '@x402/core/types'

/** The slice of an x402 facilitator the paywall uses (mockable in tests). */
export interface IX402Facilitator {
	verify(
		payload: PaymentPayload, requirements: PaymentRequirements,
	): Promise<VerifyResponse>
	settle(
		payload: PaymentPayload, requirements: PaymentRequirements,
	): Promise<SettleResponse>
}

export type PaywallConfig = {
	/** Public URL of the gated resource. */
	resourceUrl: string
	description: string
	/** CAIP-2 network, `hedera:testnet`. */
	network: string
	/** Hedera account that receives the payment. */
	payTo: string
	/** Facilitator fee payer (from `/supported`). */
	feePayer: string
	/** Price in tinybars (1 HBAR = 100,000,000). */
	amountTinybars: bigint
}

export type PaywallResult =
	| {
		status: 402
		headers: Record<string, string>
		body: PaymentRequired
	}
	| {
		status: 200
		headers: Record<string, string>
		settlement: SettleResponse
	}

/** Default price: 0.1 HBAR. */
export const AUDIT_REPORT_PRICE_TINYBARS = 10_000_000n

/** Builds the HBAR `exact` requirement for a gated resource. */
export function buildPaymentRequired(
	config: PaywallConfig, error?: string,
): PaymentRequired {
	return {
		x402Version: 2,
		...(error ? { error } : {}),
		resource: {
			url: config.resourceUrl,
			description: config.description,
			mimeType: 'application/json',
		},
		accepts: [{
			scheme: 'exact',
			network: config.network as `${string}:${string}`,
			asset: '0.0.0',
			amount: config.amountTinybars.toString(),
			payTo: config.payTo,
			maxTimeoutSeconds: 120,
			extra: { feePayer: config.feePayer },
		}],
	}
}

/** Reads the payment from `X-PAYMENT` (v1 name) or `PAYMENT-SIGNATURE`. */
export function readPaymentHeader(
	headers: Record<string, string | string[] | undefined>,
) {
	const value = headers['x-payment'] ?? headers['payment-signature']
	return Array.isArray(value) ? value[0] : value
}

function b64(value: unknown) {
	return Buffer.from(JSON.stringify(value)).toString('base64')
}

function unpaid(config: PaywallConfig, error?: string): PaywallResult {
	const body = buildPaymentRequired(config, error)
	return {
		status: 402,
		headers: { 'PAYMENT-REQUIRED': b64(body) },
		body,
	}
}

/**
 * x402 gate. No or invalid payment gives a 402 with fresh requirements.
 * A payment is checked against the requirements built here (never the
 * client's), verified, then settled through the facilitator. `decode` parses
 * the header (base64 JSON PaymentPayload).
 */
export async function runPaywall(input: {
	config: PaywallConfig
	facilitator: IX402Facilitator
	paymentHeader: string | undefined
}): Promise<PaywallResult> {
	const { config, facilitator, paymentHeader } = input
	if(!paymentHeader) {
		return unpaid(config)
	}

	let payload: PaymentPayload
	try {
		payload = JSON.parse(Buffer.from(paymentHeader, 'base64').toString('utf8'))
	} catch{
		return unpaid(config, 'Malformed payment header')
	}

	const [required] = buildPaymentRequired(config).accepts
	const accepted = payload?.accepted
	if(
		accepted?.scheme !== required.scheme
		|| accepted.network !== required.network
		|| accepted.asset !== required.asset
		|| accepted.payTo !== required.payTo
		|| accepted.amount !== required.amount
	) {
		return unpaid(config, 'Payment does not match the requirements')
	}

	try {
		const verified = await facilitator.verify(payload, required)
		if(!verified.isValid) {
			return unpaid(
				config, `Payment invalid: ${verified.invalidReason || 'unknown'}`,
			)
		}

		const settlement = await facilitator.settle(payload, required)
		if(!settlement.success) {
			return unpaid(
				config, `Settlement failed: ${settlement.errorReason || 'unknown'}`,
			)
		}

		const header = b64(settlement)
		return {
			status: 200,
			headers: { 'X-PAYMENT-RESPONSE': header, 'PAYMENT-RESPONSE': header },
			settlement,
		}
	} catch(err) {
		return unpaid(config, `Facilitator error: ${(err as Error).message}`)
	}
}
