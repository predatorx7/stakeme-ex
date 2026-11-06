import { badRequest } from '@hapi/boom'
import assert from 'node:assert'
import {
	HEDERA_ACCOUNT_ID,
	HEDERA_DIVIDEND_TOKEN_ID,
	HEDERA_NETWORK,
	HEDERA_PRIVATE_KEY,
} from '../../consts.ts'
import type {
	DividendSplit,
	DividendStreamResult,
} from '../../integrations/types.ts'
import { keccakUtf8 } from '../../integrations/util.ts'
import { LOGGER } from '../../logger.ts'
import {
	assertTransfersMatch,
	buildPaymentRequest,
	type DecodedTransfer,
	HBAR_ASSET,
	type PaymentRequest,
} from './hedera-payment-requirements.ts'

/** Largest network fee the operator pays for a creator's signed tx. */
const MAX_FEE_TINYBARS = 300_000_000n

export type HederaPaymentRequest = PaymentRequest & {
	/** `simulated` when no operator is configured: nothing is signed. */
	mode: 'live' | 'simulated'
}

export function isHederaRailLive() {
	return !!(HEDERA_ACCOUNT_ID && HEDERA_PRIVATE_KEY)
}

/** HTS dividend token when configured, else HBAR. */
export function dividendAsset() {
	return HEDERA_DIVIDEND_TOKEN_ID || HBAR_ASSET
}

/** Builds the x402 payment request for a dividend (pure apart from env). */
export function createHederaPaymentRequest(input: {
	dividendId: string
	amount: string
	splits: DividendSplit[]
}): HederaPaymentRequest {
	const request = buildPaymentRequest({
		...input,
		network: `hedera:${HEDERA_NETWORK}`,
		asset: dividendAsset(),
		feePayer: HEDERA_ACCOUNT_ID || '0.0.0',
	})
	return { ...request, mode: isHederaRailLive() ? 'live' : 'simulated' }
}

/**
 * Settles the creator's signed transaction. The server rebuilds `request`
 * from the database; it never trusts amounts or payees from the client. It
 * checks the decoded transfers, adds the operator (fee payer) signature and
 * submits. Without an operator, or for `{ simulated: true }`, receipts are
 * SIMULATED.
 */
export async function settleHederaPayment(input: {
	request: HederaPaymentRequest
	paymentPayload: Record<string, unknown> | undefined
}): Promise<DividendStreamResult> {
	const { request, paymentPayload } = input
	const transaction = extractTransaction(paymentPayload)
	if(!isHederaRailLive() || !transaction) {
		assert(
			!isHederaRailLive() || paymentPayload?.simulated === true,
			badRequest('paymentPayload.payload.transaction is required'),
		)
		LOGGER.warn('Hedera operator unset or demo payload: simulated payment')
		return simulatedResult(request)
	}

	const sdk = await import('@hiero-ledger/sdk')
	const bytes = Uint8Array.from(Buffer.from(transaction, 'base64'))
	const parsed = sdk.Transaction.fromBytes(bytes)
	assert(
		parsed instanceof sdk.TransferTransaction,
		badRequest('Payment is not a TransferTransaction'),
	)
	assert(
		parsed.transactionId?.accountId?.toString() === HEDERA_ACCOUNT_ID,
		badRequest('Payment fee payer must be the SMX operator'),
	)
	assert(
		(parsed.maxTransactionFee?.toTinybars().toBigInt() ?? 0n)
			<= MAX_FEE_TINYBARS,
		badRequest('Payment max fee is too high'),
	)
	assertTransfersMatch(request, decodeTransfers(parsed, request.asset))

	const client = sdk.Client.forName(HEDERA_NETWORK)
	try {
		client.setOperator(
			sdk.AccountId.fromString(HEDERA_ACCOUNT_ID),
			sdk.PrivateKey.fromStringECDSA(HEDERA_PRIVATE_KEY),
		)
		// Fee payer signature. The payer's own signature is already inside.
		await parsed.sign(sdk.PrivateKey.fromStringECDSA(HEDERA_PRIVATE_KEY))
		const response = await parsed.execute(client)
		const receipt = await response.getReceipt(client)
		assert(
			receipt.status === sdk.Status.Success,
			badRequest(`Hedera rejected the payment: ${receipt.status.toString()}`),
		)
		const txId = response.transactionId.toString()
		return {
			status: 'CONFIRMED',
			receipts: request.accepts.map((_, i) => `${txId}#${i}`),
		}
	} finally {
		client.close()
	}

	/** Flattens the HBAR or token transfers of the asset being paid. */
	function decodeTransfers(
		tx: InstanceType<typeof sdk.TransferTransaction>,
		asset: string,
	) {
		const out: DecodedTransfer[] = []
		if(asset === HBAR_ASSET) {
			assert(
				tx.tokenTransfers.size === 0,
				badRequest('Payment carries unexpected token transfers'),
			)
			for(const [account, amount] of tx.hbarTransfers) {
				out.push({
					account: account.toString(),
					amount: amount.toTinybars().toBigInt(),
				})
			}

			return out
		}

		// The fee payer pays fees through the HBAR list, so it may only appear
		// there as the network fee, never as a debit.
		assert(
			![...tx.hbarTransfers.values()]
				.some((h) => h.toTinybars().toBigInt() !== 0n),
			badRequest('Payment carries unexpected HBAR transfers'),
		)
		const tokenId = sdk.TokenId.fromString(asset)
		for(const [token, transfers] of tx.tokenTransfers) {
			assert(
				token.toString() === tokenId.toString(),
				badRequest('Payment carries unexpected tokens'),
			)
			for(const [account, amount] of transfers) {
				out.push({ account: account.toString(), amount: amount.toBigInt() })
			}
		}

		return out
	}
}

/** Pure: deterministic fake receipts, one per split. */
export function simulatedResult(
	request: Pick<HederaPaymentRequest, 'dividendId' | 'accepts'>,
): DividendStreamResult {
	return {
		status: 'SIMULATED',
		receipts: request.accepts.map((r) => {
			const seed = `${request.dividendId}:${r.payTo}:${r.amount}`
			return `sim:${keccakUtf8(seed)}`
		}),
	}
}

function extractTransaction(payload: Record<string, unknown> | undefined) {
	const inner = payload?.payload
	if(inner && typeof inner === 'object') {
		const tx = (inner as Record<string, unknown>).transaction
		return typeof tx === 'string' && tx ? tx : undefined
	}

	return undefined
}

/**
 * Operator pays every holder in one batched transfer (no creator signature).
 * Used by the worker when the payment was not signed in the browser.
 */
export async function payoutFromOperator(
	request: HederaPaymentRequest,
): Promise<DividendStreamResult> {
	if(!isHederaRailLive()) {
		LOGGER.warn('Hedera operator unset: simulated dividend payout')
		return simulatedResult(request)
	}

	const sdk = await import('@hiero-ledger/sdk')
	const client = sdk.Client.forName(HEDERA_NETWORK)
	try {
		const operator = sdk.AccountId.fromString(HEDERA_ACCOUNT_ID)
		client.setOperator(
			operator,
			sdk.PrivateKey.fromStringECDSA(HEDERA_PRIVATE_KEY),
		)
		const hbar = request.asset === HBAR_ASSET
		const tx = new sdk.TransferTransaction()
		for(const r of request.accepts) {
			const to = sdk.AccountId.fromString(r.payTo)
			if(hbar) {
				tx.addHbarTransfer(to, sdk.Hbar.fromTinybars(r.amount))
			} else {
				tx.addTokenTransfer(request.asset, to, Number(r.amount))
			}
		}

		if(hbar) {
			tx.addHbarTransfer(operator, sdk.Hbar.fromTinybars(`-${request.total}`))
		} else {
			tx.addTokenTransfer(request.asset, operator, -Number(request.total))
		}

		const response = await tx.execute(client)
		const receipt = await response.getReceipt(client)
		assert(receipt.status === sdk.Status.Success, new Error(
			`Hedera transfer failed: ${receipt.status.toString()}`,
		))
		const txId = response.transactionId.toString()
		return {
			status: 'CONFIRMED',
			receipts: request.accepts.map((_, i) => `${txId}#${i}`),
		}
	} catch(err) {
		LOGGER.error({ err }, 'Hedera payout failed: simulating')
		return simulatedResult(request)
	} finally {
		client.close()
	}
}
