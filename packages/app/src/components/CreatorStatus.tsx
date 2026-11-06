import type { CreatorSummary, OracleEvent } from '../types/index.ts'
import { escapeText } from '../utils/escape.ts'
import type { BadgeTone } from '../utils/tones.ts'
import { Badge } from './Badge.tsx'

const TONE: Record<CreatorSummary['status'], BadgeTone> = {
	DRAFT: 'neutral',
	LIVE: 'success',
	GRACE: 'warn',
	DEFAULTED: 'danger',
	COMPLETED: 'info',
}

const LABEL: Record<CreatorSummary['status'], string> = {
	DRAFT: 'Draft',
	LIVE: 'Live',
	GRACE: 'Grace period',
	DEFAULTED: 'Defaulted',
	COMPLETED: 'Completed',
}

/**
 * Whether the 0G agent froze the escrow (safe-stop). A creator in GRACE is
 * always frozen; otherwise the newest freeze or unfreeze event decides.
 */
export function isEscrowFrozen(
	status: CreatorSummary['status'],
	events: Pick<OracleEvent, 'kind' | 'createdAt'>[] = [],
) {
	if(status === 'GRACE') {
		return true
	}

	if(status === 'DEFAULTED' || status === 'COMPLETED') {
		return false
	}

	const newest = events
		.filter((e) => {
			const kind: string = e.kind
			return kind === 'ESCROW_FROZEN' || kind === 'ESCROW_UNFROZEN'
		})
		.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0]
	const kind: string | undefined = newest?.kind
	return kind === 'ESCROW_FROZEN'
}

/** A creator's lifecycle status, with the frozen-escrow state called out. */
export function CreatorStatusBadge({ status, frozen }: {
	status: CreatorSummary['status']
	frozen?: boolean
}) {
	return (
		<>
			<Badge tone={TONE[status]}>
				{escapeText(LABEL[status])}
			</Badge>
			{
				!!frozen && status !== 'DEFAULTED' && (
					<Badge
						tone='warn'
						title='Escrow frozen by 0G agent: proof overdue'>
						Escrow frozen
					</Badge>
				)
			}
		</>
	)
}
