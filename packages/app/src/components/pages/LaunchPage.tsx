import type { LaunchState } from '../../types/index.ts'
import { escapeText } from '../../utils/escape.ts'
import { PageHeader } from '../PageHeader.tsx'
import { SectionCard } from '../SectionCard.tsx'

/**
 * IPO form. Placeholder markup: workstream 6 builds the form, the World ID
 * button and the `POST /creators` call. Props are the `LaunchState` document.
 */
export function LaunchPage({ state }: { state: LaunchState }) {
	return (
		<>
			<PageHeader
				eyebrow='Launch'
				title='Launch your IPO' />
			<SectionCard title='Terms'>
				<p>
					{
						escapeText(
							state.hasCreator
								? `You already launched $${state.ticker}.`
								: `Share ${state.defaults.shareBps / 100}% of income for `
									+ `${state.defaults.termMonths} months from ${state.wallet}.`,
						)
					}
				</p>
			</SectionCard>
		</>
	)
}
