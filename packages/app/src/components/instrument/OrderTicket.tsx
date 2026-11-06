import { escapeText } from '../../utils/escape.ts'
import { Field } from '../forms/Field.tsx'
import { FormError } from '../forms/FormError.tsx'
import { HxForm } from '../forms/HxForm.tsx'
import { SectionCard } from '../SectionCard.tsx'

/** The slice of `market` (docs/instrument-view.md) this component reads. */
export type OrderTicketMarket = {
	pool: { usdcReserve: string, tokenReserve: string, feeBps: number }
	status: { label: string, tradingHalted: boolean }
}

const SLIPPAGE_PRESETS = [
	{ bps: 50, label: '0.5%' },
	{ bps: 100, label: '1%' },
	{ bps: 200, label: '2%' },
]

/**
 * Broker-style market order ticket. The estimate is computed in the browser
 * by `client/order-estimate.ts` from the pool reserves on the root element,
 * with the same math as `amm_swap`. The hidden `minOut` is set there from the
 * slippage setting. Submits to the existing Trade route.
 */
export function OrderTicket({ ticker, market, signedIn }: {
	ticker: string
	market: OrderTicketMarket
	signedIn: boolean
}) {
	const { pool, status } = market
	const halted = status.tradingHalted
	const sellOnly = !halted && status.label.startsWith('Term ended')
	const feePct = `${pool.feeBps / 100}%`
	const path = `/creators/${encodeURIComponent(ticker)}`

	return (
		<SectionCard
			id='order-ticket'
			title='Order ticket'
			context='Market order'
			plain>
			<div
				class='ticket'
				data-order-ticket
				data-side={sellOnly ? 'SELL' : 'BUY'}
				data-ticker={ticker}
				data-halted={String(halted)}
				data-usdc-reserve={pool.usdcReserve}
				data-token-reserve={pool.tokenReserve}
				data-fee-bps={String(pool.feeBps)}>
				{
					halted && (
						<p
							class='ticket-halt'
							role='status'>
							{
								escapeText(
									status.label.startsWith('Raise open')
										? 'Raise open'
										: `Trading is halted: ${status.label}`,
								)
							}
						</p>
					)
				}
				{
					sellOnly && (
						<p
							class='ticket-halt'
							role='status'>
							{escapeText(status.label)}
						</p>
					)
				}
				{
					signedIn
						? (
							<HxForm
								action={`${path}/trades`}
								ext='json-enc'
								class='ticket-form'>
								<Fields />
								<input
									type='hidden'
									name='minOut'
									value='0' />
								<button
									class='rc-button ticket-submit'
									data-variant='primary'
									type='submit'
									data-ticket-submit
									disabled={halted}>
									Buy
								</button>
								<FormError />
							</HxForm>
						)
						: (
							<div class='ticket-form'>
								<Fields />
								<button
									class='rc-button ticket-submit'
									data-variant='primary'
									type='button'
									data-wallet-connect>
									Connect wallet to trade
								</button>
							</div>
						)
				}
				<p class='ticket-note'>
					Market order on the SMX pool. Limit orders aren't supported.
				</p>
			</div>
		</SectionCard>
	)

	function Fields() {
		return (
			<>
				<fieldset
					class='ticket-tabs'
					disabled={halted}>
					<legend class='rc-visually-hidden'>
						Side
					</legend>
					<label data-tab='BUY'>
						<input
							type='radio'
							name='side'
							value='BUY'
							disabled={sellOnly}
							checked={!sellOnly} />
						Buy
					</label>
					<label data-tab='SELL'>
						<input
							type='radio'
							name='side'
							value='SELL'
							checked={sellOnly} />
						Sell
					</label>
				</fieldset>
				<Field
					name='amountIn'
					label='Amount (USDC)'
					type='text'
					required
					placeholder='100.00'
					pattern='[0-9]+(\.[0-9]{1,18})?'
					disabled={halted} />
				<fieldset
					class='ticket-slippage'
					disabled={halted}>
					<legend>
						Slippage
					</legend>
					{
						SLIPPAGE_PRESETS.map((p) => (
							<button
								type='button'
								class='ticket-chip'
								data-slippage-bps={String(p.bps)}
								aria-pressed={String(p.bps === 50)}>
								{escapeText(p.label)}
							</button>
						))
					}
					<input
						type='text'
						class='rc-input ticket-chip'
						data-slippage-custom
						inputmode='decimal'
						autocomplete='off'
						placeholder='Custom %'
						aria-label='Custom slippage in percent' />
				</fieldset>
				<dl
					class='ticket-estimate'
					aria-live='polite'>
					<dt>
						Estimated price
					</dt>
					<dd data-est='price'>
						—
					</dd>
					<dt>
						{escapeText(`Fee (${feePct})`)}
					</dt>
					<dd data-est='fee'>
						—
					</dd>
					<dt>
						Price impact
					</dt>
					<dd data-est='impact'>
						—
					</dd>
					<dt>
						You receive
					</dt>
					<dd data-est='out'>
						—
					</dd>
					<dt>
						Minimum received (
						<span data-est='slip'>
							0.5%
						</span>
						)
					</dt>
					<dd data-est='min'>
						—
					</dd>
				</dl>
				<p
					class='ticket-status'
					data-est='status' />
			</>
		)
	}
}
