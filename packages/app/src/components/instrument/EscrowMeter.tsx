import { escapeText, trustedHtml } from '../../utils/escape.ts'
import { formatUsdc } from '../../utils/money.ts'

export type EscrowMeterTranche = {
	idx: number
	amount: string
	status: 'LOCKED' | 'RELEASED' | 'REFUNDED'
	/** Share of the target in bps. Derived from `amount` when absent. */
	bps?: number
}

export type EscrowMeterStatus
	= 'LIVE' | 'GRACE' | 'FROZEN' | 'DEFAULTED' | 'COMPLETED'

// Static markup, no user input.
const LOCK = trustedHtml(
	'<svg class="smx-escrow-meter__lock" width="14" height="14"'
	+ ' viewBox="0 0 16 16" fill="none"'
	+ ' stroke="currentColor" stroke-width="1.5" aria-hidden="true">'
	+ '<rect x="3" y="7" width="10" height="7" rx="1.5"/>'
	+ '<path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/></svg>',
)

/**
 * Escrow vault meter: one segment per tranche, width proportional to its
 * share. Released = gold, next = hatched, locked = outline. `client/
 * escrow-meter.ts` fills a segment live on a TRANCHE_RELEASED event.
 * `raised` and `target` are USDC decimal strings.
 */
export function EscrowMeter({
	ticker,
	tranches,
	status,
	raised,
	target,
	raising,
}: {
	ticker: string
	tranches: EscrowMeterTranche[]
	status: EscrowMeterStatus
	raised?: string
	target?: string
	/** Raise still open: every tranche stays locked. */
	raising?: boolean
}) {
	const frozen = status === 'FROZEN' || status === 'GRACE'
	const defaulted = status === 'DEFAULTED'
	const sum = (s: EscrowMeterTranche['status']) => tranches
		.filter((t) => t.status === s)
		.reduce((n, t) => n + Number(t.amount), 0)
	const total = Number(target) > 0
		? Number(target)
		: tranches.reduce((n, t) => n + Number(t.amount), 0)
	const released = sum('RELEASED')
	const refunded = sum('REFUNDED')
	const held = raised !== undefined
		? Math.max(0, Number(raised) - released - refunded)
		: sum('LOCKED')
	const nextIdx = tranches.find((t) => t.status === 'LOCKED')?.idx
	const done = tranches.filter((t) => t.status === 'RELEASED').length

	const out = defaulted
		? `${formatUsdc(refunded)} refunded to holders`
		: `${formatUsdc(held)} in escrow on Hedera`
	const aria = `Escrow: ${done} of ${tranches.length} tranches released`
	const legend = raising
		? `Raise open: ${formatUsdc(raised ?? 0)} of ${formatUsdc(total)}`
		: `${formatUsdc(released)} released · ${out}`

	return (
		<div
			class='smx-escrow-meter'
			data-escrow-meter
			data-ticker={ticker}
			data-status={status}
			data-frozen={frozen ? '' : undefined}>
			<div
				class='smx-escrow-meter__bar'
				role='img'
				aria-label={aria}>
				{
					tranches.map((t) => {
						const bps = t.bps ?? (
							total > 0 ? Math.round(Number(t.amount) / total * 10000) : 0
						)
						const state = t.status === 'RELEASED'
							? 'released'
							: t.status === 'REFUNDED'
								? 'refunded'
								: !frozen && !defaulted && !raising && t.idx === nextIdx
									? 'next'
									: 'locked'
						return (
							<span
								class='smx-escrow-meter__seg'
								data-idx={t.idx}
								data-state={state}
								style={`flex-grow:${Math.max(1, bps)}`}
								aria-hidden='true' />
						)
					})
				}
			</div>
			<p class='smx-escrow-meter__legend'>
				{escapeText(legend)}
			</p>
			{
				frozen && (
					<p class='smx-escrow-meter__note'>
						{LOCK}
						{' '}
						Escrow frozen: proof overdue
					</p>
				)
			}
			{
				defaulted && (
					<p class='smx-escrow-meter__note'>
						Refunded to holders
					</p>
				)
			}
		</div>
	)
}
