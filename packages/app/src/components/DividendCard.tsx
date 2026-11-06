import { DEMO_MODE, DIVIDEND_HBAR_PER_USDC } from '../consts.ts'
import { isHederaRailLive } from '../services/index.ts'
import {
	convertToTinybars,
	formatHbar,
	toMicro,
} from '../services/payment/hedera-payment-requirements.ts'
import { escapeText } from '../utils/escape.ts'
import { formatUsdc } from '../utils/money.ts'
import { FormError } from './forms/FormError.tsx'
import { HxForm } from './forms/HxForm.tsx'
import { HederaSignerDialog } from './WalletDialogs.tsx'

/** HBAR the creator sends for `amountDue` USDC at the testnet conversion. */
export function dividendHbar(amountDue: string) {
	const [tinybars] = convertToTinybars(
		[toMicro(amountDue)], DIVIDEND_HBAR_PER_USDC,
	)
	return formatHbar(tinybars)
}

/**
 * The dividend chain on the Hub: bank deposit, 0G audit, dividend due, pay on
 * Hedera, split to holders. Shows the USD due next to the HBAR actually sent.
 */
export function DividendCard({ dividendId, amountDue, income, shareBps }: {
	dividendId: string
	amountDue: string
	/** Proven income the dividend was computed from. */
	income: number
	shareBps: number
}) {
	const live = isHederaRailLive()
	const usd = formatUsdc(amountDue)
	const hbar = dividendHbar(amountDue)
	return (
		<>
			<ol
				class='smx-dividend-chain'
				aria-label='How the dividend is paid'>
				<li>
					{escapeText(`Bank deposit ${formatUsdc(income)} (Reclaim proof)`)}
				</li>
				<li>
					0G audit approved
				</li>
				<li>
					<strong>
						{escapeText(`Dividend due ${usd} (${shareBps / 100}%)`)}
					</strong>
				</li>
				<li>
					Pay on Hedera, one transfer
				</li>
				<li>
					Split pro rata to
					{' '}
					<span data-hedera-pay-holders>
						every holder
					</span>
				</li>
			</ol>
			<p>
				{
					escapeText(
						live
							? `You send ${hbar} HBAR (${usd} due). Testnet rate: `
							+ `${DIVIDEND_HBAR_PER_USDC} HBAR per USDC, not a market price.`
							: `Demo mode: ${usd} due, no HBAR moves.`,
					)
				}
			</p>
			<div class='smx-actions'>
				<button
					type='button'
					class='rc-button'
					data-variant='primary'
					data-dw-sparkle
					data-hedera-pay={`/dividends/${dividendId}/payment-request`}
					data-hedera-settle={`/dividends/${dividendId}/payment`}>
					{
						escapeText(
							live ? `Pay ${hbar} HBAR on Hedera` : `Pay ${usd} on Hedera`,
						)
					}
				</button>
				<output
					data-hedera-pay-status
					aria-live='polite' />
			</div>
			<HederaSignerDialog />
			{
				DEMO_MODE && (
					<HxForm
						action={`/dividends/${dividendId}/payment`}
						class='smx-form'>
						<button
							type='submit'
							class='rc-button'
							data-variant='inline'>
							Mark as paid (demo)
						</button>
						<FormError />
					</HxForm>
				)
			}
		</>
	)
}

/** After payment: what was sent and the HashScan link (client fills it). */
export function DividendReceiptCell({ dividendId }: { dividendId: string }) {
	return (
		<span data-hedera-receipt={dividendId}>
			—
		</span>
	)
}
