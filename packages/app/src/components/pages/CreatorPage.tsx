import type { CreatorPage as CreatorPageData } from '../../types/index.ts'
import { escapeText } from '../../utils/escape.ts'
import { formatUsdc } from '../../utils/money.ts'
import { OracleEventItem } from '../events/OracleEventItem.tsx'
import { PageHeader } from '../PageHeader.tsx'
import { SectionCard } from '../SectionCard.tsx'

/**
 * Token page. Placeholder markup: workstream 6 adds the chart, buy/sell form,
 * escrow progress and holders table. Props are the `CreatorPage` document.
 */
export function CreatorPage({ page }: { page: CreatorPageData }) {
	const c = page.creator
	return (
		<>
			<PageHeader
				eyebrow={`$${c.ticker}`}
				title={c.displayName}
				lede={c.headline} />
			<SectionCard title='Terms'>
				<p>
					{
						escapeText(
							`${c.status}. Price ${formatUsdc(c.price, 4)}, `
						+ `raised ${formatUsdc(c.raised)} of ${formatUsdc(c.targetRaise)}, `
						+ `${c.shareBps / 100}% of income for ${c.termMonths} months.`,
						)
					}
				</p>
			</SectionCard>
			<SectionCard title='Events'>
				<ul>
					{page.events.map((e) => <OracleEventItem event={e} />)}
				</ul>
			</SectionCard>
		</>
	)
}
