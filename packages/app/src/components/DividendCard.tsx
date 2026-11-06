import { DEMO_MODE, DIVIDEND_HBAR_PER_USDC, HEDERA_NETWORK } from '../consts.ts'
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
	// No rate (mainnet without DIVIDEND_HBAR_PER_USDC): the HBAR rail is off.
	if(!DIVIDEND_HBAR_PER_USDC) {
		return ''
	}

	const [tinybars] = convertToTinybars(
		[toMicro(amountDue)], DIVIDEND_HBAR_PER_USDC,
	)
	return formatHbar(tinybars)
}

/**
 * The dividend chain on the Hub: bank deposit, 0G audit, dividend due, pay,
 * holders. Onchain creators (`onchain`) pay in USDC through their ISA with a
 * wallet-signed `distributeDividend`, and holders claim it from Portfolio.
 * Other creators pay on Hedera and the card shows the USD due next to the
 * HBAR actually sent.
 */
export function DividendCard({
	dividendId,
	ticker,
	amountDue,
	income,
	shareBps,
	onchain = false,
}: {
	dividendId: string
	ticker: string
	amountDue: string
	/** Proven income the dividend was computed from. */
	income: number
	shareBps: number
	/** Live chain mode and the creator has an ISA address. */
	onchain?: boolean
}) {
	const live = isHederaRailLive()
	const usd = formatUsdc(amountDue)
	const hbar = dividendHbar(amountDue)
	if(onchain) {
		return (
			<OnchainDividend
				dividendId={dividendId}
				ticker={ticker}
				amountDue={amountDue}
				usd={usd}
				income={income}
				shareBps={shareBps} />
		)
	}

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
						!hbar
							? `${usd} due. HBAR payments are off on mainnet.`
							: live
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
					disabled={!hbar}
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

function DividendSteps({ usd, income, shareBps, last }: {
	usd: string
	income: number
	shareBps: number
	last: string
}) {
	return (
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
				Pay in USDC from your wallet
			</li>
			<li>
				{escapeText(last)}
			</li>
		</ol>
	)
}

/**
 * Live chain: the creator's wallet approves USDC and calls
 * `distributeDividend`; `client/chain-trade.ts` signs it and posts the hash.
 */
function OnchainDividend({
	dividendId,
	ticker,
	amountDue,
	usd,
	income,
	shareBps,
}: {
	dividendId: string
	ticker: string
	amountDue: string
	usd: string
	income: number
	shareBps: number
}) {
	return (
		<div data-chain-dividend-scope={ticker}>
			<DividendSteps
				usd={usd}
				income={income}
				shareBps={shareBps}
				last='Holders claim their share from Portfolio' />
			<p>
				{
					escapeText(
						`You pay ${usd} in USDC from your wallet (needs a little HBAR `
						+ 'for gas). Holders then claim their share.',
					)
				}
			</p>
			<div class='smx-actions'>
				<button
					type='button'
					class='rc-button'
					data-variant='primary'
					data-dw-sparkle
					data-chain-dividend={dividendId}
					data-ticker={ticker}
					data-amount={amountDue}>
					{escapeText(`Pay ${usd} in USDC`)}
				</button>
				<output
					data-chain-dividend-status
					aria-live='polite' />
			</div>
		</div>
	)
}

/** After an onchain payment: the receipt line with its HashScan link. */
export function OnchainDividendReceipt({ txHash }: { txHash: string }) {
	return (
		<p>
			Paid in USDC. Holders claim it from Portfolio.
			{' '}
			<a
				href={`https://hashscan.io/${HEDERA_NETWORK}/transaction/${txHash}`}
				target='_blank'
				rel='noopener noreferrer'>
				View on HashScan
			</a>
		</p>
	)
}
