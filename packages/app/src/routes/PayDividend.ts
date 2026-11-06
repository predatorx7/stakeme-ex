import { badRequest, conflict } from '@hapi/boom'
import assert from 'node:assert'
import { parseUnits } from 'viem'
import {
	decodeDividendReceipt,
	isChainConfigured,
	verifyUserTx,
} from '../integrations/chain.ts'
import { getCreatorChain, payDividend, payDividendOnchain } from '../queries.ts'
import { createPaymentService, hashscanTxUrl } from '../services/index.ts'
import type { ITypedExpressRequest } from '../types/openapi.ts'
import { loadPayableDividend } from '../utils/dividend-payment.ts'
import { respondMutation } from '../utils/mutation.ts'

/**
 * `POST /dividends/{dividendId}/payment` — the creator pays a dividend.
 *
 * Creator with an ISA on a live chain: their wallet signed
 * `distributeDividend` in USDC; the body carries its `txHash`, the receipt is
 * verified (sender, ISA, event amount) and holders claim from their portfolio.
 * No HBAR moves. Otherwise (DB-only or simulated creator): with a
 * `paymentPayload` (the transaction their wallet signed for the x402 request)
 * the payment rail settles it first; without one the worker pays holders from
 * the platform on `DIVIDEND_PAID`.
 */
export default async function PayDividendRoute(
	req: ITypedExpressRequest<'PayDividend'>,
) {
	const viewerId = req.authMetadata!.id
	const paymentPayload = req.body?.paymentPayload
	const txHash = req.body?.txHash
	const owned = await loadPayableDividend(
		req.pg, req.params.dividendId, viewerId,
	)
	const [chain] = await getCreatorChain.run({ ticker: owned.ticker }, req.pg)
	if(isChainConfigured() && chain?.contract_address) {
		assert(owned.status === 'DUE', conflict('Dividend was already paid'))
		assert(
			txHash,
			conflict('Sign this dividend in USDC with your wallet first'),
		)
		const wallet = req.authMetadata!.walletAddress
		assert(wallet, badRequest('Link a wallet to pay'))
		const isa = chain.contract_address
		const logs = await verifyUserTx(txHash, { to: isa, from: wallet })
		const { amount } = decodeDividendReceipt(logs, { isa, payer: wallet })
		assert(
			amount === parseUnits(owned.amountDue, 6),
			conflict('The deposit does not match the dividend due'),
		)
		const [paid] = await payDividendOnchain.run(
			{
				dividend_id: owned.id,
				tx_hash: txHash,
				holders: owned.splits.length,
				viewer_id: viewerId,
			},
			req.pg,
		)
		respondMutation(req, req.res!, {
			// Cast: `dividend_json` builds a JSON object.
			body: {
				...paid.j as object,
				settlement: {
					status: 'ONCHAIN',
					txId: txHash,
					hashscanUrl: hashscanTxUrl(txHash),
					holders: paid.holders,
				},
			},
			trigger: 'smx:dividend-paid',
		})
		return
	}

	// `dividends.paid_tx_hash` holds 0x hashes only. A Hedera transaction id
	// (`0.0.x@s.n`) lives in the stored receipts and in this response.
	let settlement: Record<string, string> | undefined
	if(paymentPayload) {
		assert(owned.status === 'DUE', conflict('Dividend was already paid'))
		const settled = await createPaymentService(req.pg)
			.settle(owned, paymentPayload)
		const txId = settled.receipts[0]?.split('#')[0]
		settlement = { status: settled.status }
		if(txId && settled.status === 'CONFIRMED') {
			settlement.txId = txId
			settlement.hashscanUrl = hashscanTxUrl(txId)
		}
	}

	const [row] = await payDividend.run(
		{
			dividend_id: req.params.dividendId,
			viewer_id: viewerId,
			tx_hash: null,
		},
		req.pg,
	)
	respondMutation(req, req.res!, {
		// Cast: `dividend_json` builds a JSON object.
		body: settlement ? { ...row.j as object, settlement } : row.j,
		trigger: 'smx:dividend-paid',
	})
}
