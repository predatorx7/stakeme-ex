import { parseUnits } from 'viem'
import {
	HEDERA_ACCOUNT_ID,
	HEDERA_DIVIDEND_TOKEN_ID,
	HEDERA_NETWORK,
	HEDERA_PRIVATE_KEY,
} from '../consts.ts'
import { LOGGER } from '../logger.ts'
import type { DividendSplit, DividendStreamResult } from './types.ts'
import { keccakUtf8 } from './util.ts'

const TOKEN_DECIMALS = 6

export function isHederaConfigured() {
	return !!(HEDERA_ACCOUNT_ID && HEDERA_PRIVATE_KEY && HEDERA_DIVIDEND_TOKEN_ID)
}

/**
 * Pays each holder's dividend share on Hedera as an HTS token transfer
 * (`HEDERA_DIVIDEND_TOKEN_ID`, 6 decimals) from the operator account. Holders
 * are addressed by EVM alias. Onchain accounting in `LiquidISA` stays the
 * source of truth; this is the "stream" rail (docs/integrations/hedera.md,
 * option A). Without operator keys, or when a payment fails, receipts are
 * SIMULATED (`sim:` prefix) and the overall status is SIMULATED.
 */
export async function streamDividend(input: {
	dividendId: string
	contractAddress: string | null
	splits: DividendSplit[]
}): Promise<DividendStreamResult> {
	if(!isHederaConfigured()) {
		LOGGER.warn('Hedera operator unset: simulated dividend stream')
		return simulateStream(input.dividendId, input.splits)
	}

	const {
		AccountId,
		Client,
		PrivateKey,
		Status,
		TokenId,
		TransferTransaction,
	} = await import('@hiero-ledger/sdk')
	const client = HEDERA_NETWORK === 'mainnet'
		? Client.forMainnet()
		: Client.forTestnet()
	try {
		const operator = AccountId.fromString(HEDERA_ACCOUNT_ID)
		client.setOperator(operator, PrivateKey.fromStringECDSA(HEDERA_PRIVATE_KEY))
		const token = TokenId.fromString(HEDERA_DIVIDEND_TOKEN_ID)

		const receipts: string[] = []
		let allReal = true
		for(const split of input.splits) {
			try {
				const micro = Number(parseUnits(split.amount, TOKEN_DECIMALS))
				const response = await new TransferTransaction()
					.addTokenTransfer(token, operator, -micro)
					.addTokenTransfer(
						token,
						AccountId.fromEvmAddress(0, 0, split.wallet),
						micro,
					)
					.execute(client)
				const receipt = await response.getReceipt(client)
				if(receipt.status !== Status.Success) {
					throw new Error(`status ${receipt.status.toString()}`)
				}

				receipts.push(response.transactionId.toString())
			} catch(err) {
				LOGGER.error({ err, wallet: split.wallet }, 'HTS transfer failed')
				allReal = false
				receipts.push(simulatedReceipt(input.dividendId, split))
			}
		}

		return { status: allReal ? 'CONFIRMED' : 'SIMULATED', receipts }
	} finally {
		client.close()
	}
}

/** Pure: deterministic fake receipts, one per split. */
export function simulateStream(
	dividendId: string,
	splits: DividendSplit[],
): DividendStreamResult {
	return {
		status: 'SIMULATED',
		receipts: splits.map((s) => simulatedReceipt(dividendId, s)),
	}
}

function simulatedReceipt(dividendId: string, split: DividendSplit) {
	return `sim:${keccakUtf8(`${dividendId}:${split.wallet}:${split.amount}`)}`
}
