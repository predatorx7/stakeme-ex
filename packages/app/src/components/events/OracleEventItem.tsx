import type { OracleEvent } from '../../types/index.ts'
import { escapeText } from '../../utils/escape.ts'
import { formatUsdc } from '../../utils/money.ts'
import type { BadgeTone } from '../../utils/tones.ts'
import { Badge } from '../Badge.tsx'

/** Keyed by string so new backend kinds fall back to neutral. */
const KIND_TONE: Record<string, BadgeTone> = {
	IPO: 'info',
	INVESTED: 'success',
	PROOF_VERIFIED: 'success',
	PROOF_REJECTED: 'danger',
	TRANCHE_RELEASED: 'success',
	DIVIDEND_PAID: 'success',
	GRACE_STARTED: 'warn',
	DEFAULTED: 'danger',
	TRADE: 'neutral',
	ESCROW_FROZEN: 'warn',
	ESCROW_UNFROZEN: 'success',
	STORAGE_CONFIRMED: 'info',
}

/** One-line plain-text summary of an event, shared by HTML and tests. */
export function describeEvent(event: OracleEvent) {
	const p = event.payload
	const usd = (key: string) => {
		const v = p[key]
		return typeof v === 'string' ? formatUsdc(v) : ''
	}

	const kind: string = event.kind
	switch (kind) {
		case 'IPO':
			return `IPO launched, target ${usd('targetRaise')}`
		case 'INVESTED':
			return `Invested ${usd('usdcAmount')}`
		case 'TRADE':
			return `${String(p.side)} ${usd('usdcAmount')}`
		case 'PROOF_VERIFIED':
			return `Income verified: ${usd('amount')}`
		case 'PROOF_REJECTED':
			return `Proof rejected: ${String(p.reason ?? 'rules not met')}`
		case 'TRANCHE_RELEASED':
			return `Tranche ${String(p.idx)} released: ${usd('amount')}`
		case 'DIVIDEND_PAID':
			return `Dividend paid: ${usd('amount')}`
		case 'GRACE_STARTED':
			return 'Missed proof deadline, grace period started'
		case 'DEFAULTED':
			return `Defaulted. Refunds ${usd('refundTotal')}, `
				+ `slashed ${usd('slashTotal')}`
		case 'ESCROW_FROZEN':
			return 'Escrow frozen by 0G agent: proof overdue'
		case 'ESCROW_UNFROZEN':
			return 'Escrow unfrozen after an approved proof'
		case 'STORAGE_CONFIRMED':
			return p.kind === 'AUDIT_LOG'
				? 'Audit log stored on 0G Storage'
				: 'L-ISA terms stored on 0G Storage'
		default:
			return kind
	}
}

/**
 * One row of the live feed. The SSE route renders this same component into
 * the `oracle-event` stream event, so the page and the stream never drift.
 */
export function OracleEventItem({ event }: { event: OracleEvent }) {
	return (
		<li
			class='smx-event'
			data-kind={event.kind}
			data-event-id={event.id}>
			<Badge tone={KIND_TONE[event.kind] ?? 'neutral'}>
				{escapeText(event.kind.replaceAll('_', ' ').toLowerCase())}
			</Badge>
			<a href={`/creators/${event.ticker}`}>
				{escapeText(`$${event.ticker}`)}
			</a>
			<span>
				{escapeText(describeEvent(event))}
			</span>
			<time
				datetime={event.createdAt}
				data-local-time='time'>
				{escapeText(event.createdAt.slice(11, 19))}
			</time>
		</li>
	)
}
