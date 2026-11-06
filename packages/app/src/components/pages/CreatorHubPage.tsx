import type { CreatorHub } from '../../types/index.ts'
import { escapeText } from '../../utils/escape.ts'
import { formatUsdc } from '../../utils/money.ts'
import { EmptyState } from '../EmptyState.tsx'
import { PageHeader } from '../PageHeader.tsx'
import { SectionCard } from '../SectionCard.tsx'

/**
 * Creator hub. Placeholder markup: workstream 6 adds the escrow bar, Reclaim
 * proof button (`POST /creators/{ticker}/reclaim-sessions`), pay-dividend
 * button (`POST /dividends/{id}/payment`) and collateral card. Props are the
 * `CreatorHub` document.
 */
export function CreatorHubPage({ hub }: { hub: CreatorHub }) {
	const c = hub.creator
	if(!c) {
		return (
			<>
				<PageHeader title='Creator hub' />
				<EmptyState
					title='You have not launched an IPO'
					hint='Launch one to start raising.' />
			</>
		)
	}

	return (
		<>
			<PageHeader
				eyebrow={`$${c.ticker}`}
				title='Creator hub'
				lede={c.displayName} />
			<SectionCard title='Escrow'>
				<p>
					{
						escapeText(
							`Released ${formatUsdc(c.escrow.released)}, `
						+ `locked ${formatUsdc(c.escrow.locked)}.`,
						)
					}
				</p>
			</SectionCard>
			<SectionCard title='Pending dividend'>
				<p>
					{
						escapeText(
							hub.pendingDividend
								? `${formatUsdc(hub.pendingDividend.amountDue)} due`
								: 'Nothing due.',
						)
					}
				</p>
			</SectionCard>
		</>
	)
}
