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
	CREATOR_UPDATE: 'info',
	STAKE_RETURNED: 'success',
}

/** The badge text for an event kind, for example `proof verified`. */
export function eventLabel(kind: string) {
	return kind === 'IPO' ? 'IPO' : kind.replaceAll('_', ' ').toLowerCase()
}

/**
 * The detail after the kind in a feed row, so a row reads
 * `$MUSH · proof verified · $5,000`. Empty when the kind says it all.
 */
export function describeEvent(event: OracleEvent) {
	const p = event.payload
	const usd = (key: string) => {
		const v = p[key]
		return typeof v === 'string' ? formatUsdc(v) : ''
	}

	const kind: string = event.kind
	switch (kind) {
		case 'IPO':
			return `target ${usd('targetRaise')}`
		case 'INVESTED':
			return usd('usdcAmount')
		case 'TRADE':
			return `${String(p.side).toLowerCase()} ${usd('usdcAmount')}`
		case 'PROOF_VERIFIED':
			return usd('amount')
		case 'PROOF_REJECTED':
			return String(p.reason ?? 'rules not met')
		case 'TRANCHE_RELEASED':
			return `tranche ${String(p.idx)} · ${usd('amount')}`
		case 'DIVIDEND_PAID':
		case 'STAKE_RETURNED':
			return usd('amount')
		case 'GRACE_STARTED':
			return 'proof deadline missed'
		case 'DEFAULTED':
			return `refunds ${usd('refundTotal')} · slashed ${usd('slashTotal')}`
		case 'ESCROW_FROZEN':
			return 'proof overdue'
		case 'ESCROW_UNFROZEN':
			return 'proof approved'
		case 'CREATOR_UPDATE':
			return String(p.body ?? '')
		case 'STORAGE_CONFIRMED':
			return p.kind === 'AUDIT_LOG' ? 'audit log' : 'terms'
		default:
			return ''
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
			<a href={`/creators/${event.ticker}`}>
				{escapeText(`$${event.ticker}`)}
			</a>
			<Badge tone={KIND_TONE[event.kind] ?? 'neutral'}>
				{escapeText(eventLabel(event.kind))}
			</Badge>
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
