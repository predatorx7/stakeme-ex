import { escapeText } from '../../utils/escape.ts'
import { formatUsdc } from '../../utils/money.ts'
import type { BadgeTone } from '../../utils/tones.ts'
import { Badge } from '../Badge.tsx'
import { SectionCard } from '../SectionCard.tsx'

export type CorporateAction = {
	at: string
	kind: 'IPO' | 'PROOF_VERIFIED' | 'PROOF_REJECTED' | 'TRANCHE_RELEASED'
		| 'DIVIDEND_PAID' | 'ESCROW_FROZEN' | 'ESCROW_UNFROZEN' | 'DEFAULTED'
		| 'CREATOR_UPDATE' | 'STAKE_RETURNED'
	label: string
	amount: string | null
}

const MAX_ITEMS = 8

const KINDS: Record<
	CorporateAction['kind'],
	{ text: string, tone: BadgeTone }
> = {
	IPO: { text: 'IPO', tone: 'info' },
	PROOF_VERIFIED: { text: 'Income verified', tone: 'success' },
	PROOF_REJECTED: { text: 'Proof rejected', tone: 'danger' },
	TRANCHE_RELEASED: { text: 'Tranche released', tone: 'success' },
	DIVIDEND_PAID: { text: 'Dividend paid', tone: 'success' },
	ESCROW_FROZEN: { text: 'Escrow frozen', tone: 'danger' },
	ESCROW_UNFROZEN: { text: 'Escrow unfrozen', tone: 'success' },
	DEFAULTED: { text: 'Defaulted', tone: 'danger' },
	CREATOR_UPDATE: { text: 'Creator update', tone: 'info' },
	STAKE_RETURNED: { text: 'Stake returned', tone: 'success' },
}

/**
 * Vertical timeline of a creator's corporate actions, newest first. Shows at
 * most 8; `hasMore` adds a link to the full activity feed.
 */
export function CorporateActions({ actions, ticker, hasMore }: {
	actions: CorporateAction[]
	ticker: string
	hasMore: boolean
}) {
	const items = [...actions]
		.sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
		.slice(0, MAX_ITEMS)

	return (
		<SectionCard title='Corporate actions'>
			<div class='smx-actions smx-body'>
				{
					items.length === 0
						? (
							<p class='smx-actions-empty'>
								No corporate actions yet.
							</p>
						)
						: (
							<ol>
								{
									items.map(item => (
										<li data-kind={item.kind}>
											<time
												datetime={item.at}
												data-local-time='date'>
												{escapeText(item.at.slice(0, 10))}
											</time>
											<Badge tone={KINDS[item.kind].tone}>
												{escapeText(KINDS[item.kind].text)}
											</Badge>
											<span>
												{escapeText(item.label)}
											</span>
											{
												item.amount !== null && (
													<strong>
														{escapeText(formatUsdc(item.amount))}
													</strong>
												)
											}
										</li>
									))
								}
							</ol>
						)
				}
				{
					(hasMore || actions.length > MAX_ITEMS) && (
						<a href={`/activity?ticker=${encodeURIComponent(ticker)}`}>
							View all
						</a>
					)
				}
			</div>
		</SectionCard>
	)
}
