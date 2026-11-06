import type { OracleEvent } from '../../types/index.ts'
import { escapeText } from '../../utils/escape.ts'
import { formatUsdc } from '../../utils/money.ts'
import type { BadgeTone } from '../../utils/tones.ts'
import { Badge } from '../Badge.tsx'

const KIND_TONE: Record<OracleEvent['kind'], BadgeTone> = {
	IPO: 'info',
	INVESTED: 'success',
	PROOF_VERIFIED: 'success',
	PROOF_REJECTED: 'danger',
	TRANCHE_RELEASED: 'success',
	DIVIDEND_PAID: 'success',
	GRACE_STARTED: 'warn',
	DEFAULTED: 'danger',
	TRADE: 'neutral',
}

/** One-line plain-text summary of an event, shared by HTML and tests. */
export function describeEvent(event: OracleEvent) {
	const p = event.payload
	const usd = (key: string) => {
		const v = p[key]
		return typeof v === 'string' ? formatUsdc(v) : ''
	}

	switch (event.kind) {
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
		default:
			return event.kind
	}
}

/**
 * One row of the live feed. The SSE route renders this same component into
 * the `oracle-event` stream event, so the page and the stream never drift.
 * Workstream 6 styles it.
 */
export function OracleEventItem({ event }: { event: OracleEvent }) {
	return (
		<li
			class='smx-event'
			data-kind={event.kind}
			data-event-id={event.id}>
			<Badge tone={KIND_TONE[event.kind]}>
				{escapeText(event.kind)}
			</Badge>
			{' '}
			<a href={`/creators/${event.ticker}`}>
				{escapeText(`$${event.ticker}`)}
			</a>
			{' '}
			<span>
				{escapeText(describeEvent(event))}
			</span>
			{' '}
			<time
				datetime={event.createdAt}
				data-local-time>
				{escapeText(event.createdAt)}
			</time>
		</li>
	)
}
