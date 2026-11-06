import type { OracleEvent } from '../../types/index.ts'
import { escapeText } from '../../utils/escape.ts'
import { withQueryParams } from '../../utils/http.ts'
import { EmptyState } from '../EmptyState.tsx'
import { eventLabel, OracleEventItem } from '../events/OracleEventItem.tsx'
import { PageHeader } from '../PageHeader.tsx'
import { SectionCard } from '../SectionCard.tsx'
import { LIST_BODY_ID, Pager } from './Pager.tsx'

/** Keep in step with `oracle_event_kind` in `sql/ddl.sql`. */
const KINDS = [
	'IPO',
	'INVESTED',
	'PROOF_VERIFIED',
	'PROOF_REJECTED',
	'TRANCHE_RELEASED',
	'DIVIDEND_PAID',
	'GRACE_STARTED',
	'DEFAULTED',
	'TRADE',
	'ESCROW_FROZEN',
	'ESCROW_UNFROZEN',
	'STORAGE_CONFIRMED',
]

type Props = {
	items: OracleEvent[]
	nextPageCursor?: string
	kind: string
	ticker: string
	cursor?: string
	/** The request URL, so page links keep the filters. */
	url: string
}

/** `GET /activity`: the oracle event history, filterable by kind and ticker. */
export function ActivityListPage(props: Props) {
	const { items, kind, ticker, url } = props
	const filtered = kind !== 'all' || !!ticker
	return (
		<div class='smx-page'>
			<PageHeader
				title='Activity'
				lede='Every proof audit, trade and payout, newest first.' />
			<SectionCard title='Oracle events'>
				<form
					class='rc-filter-toolbar smx-filters'
					method='get'
					action='/activity'
					role='search'>
					<div class='rc-filter-toolbar__controls'>
						<div class='rc-filter-toolbar__field'>
							<label
								class='rc-label'
								for='activity-kind'>
								Kind
							</label>
							<select
								id='activity-kind'
								class='rc-select'
								name='kind'>
								<option
									value='all'
									selected={kind === 'all'}>
									All
								</option>
								{
									KINDS.map((k) => (
										<option
											value={k}
											selected={k === kind}>
											{escapeText(eventLabel(k))}
										</option>
									))
								}
							</select>
						</div>
						<div class='rc-filter-toolbar__field'>
							<label
								class='rc-label'
								for='activity-ticker'>
								Ticker
							</label>
							<input
								id='activity-ticker'
								class='rc-input'
								type='text'
								name='ticker'
								value={ticker}
								maxlength='6'
								pattern='[A-Za-z]{0,6}'
								placeholder='MUSH' />
						</div>
						<div class='rc-filter-toolbar__actions'>
							{
								filtered && (
									<a
										class='rc-button'
										href='/activity'>
										Reset
									</a>
								)
							}
							<button
								class='rc-button'
								data-variant='primary'
								type='submit'>
								Apply
							</button>
						</div>
					</div>
				</form>
				{
					items.length === 0
						? (
							<EmptyState
								title={filtered ? 'No events match' : 'No events yet'}
								hint={
									filtered
										? 'Try another kind or ticker.'
										: 'Events appear as creators launch, raise and trade.'
								} />
						)
						: (
							<ul
								id={LIST_BODY_ID}
								class='smx-feed'>
								{items.map((e) => <OracleEventItem event={e} />)}
							</ul>
						)
				}
			</SectionCard>
			<Pager
				nextHref={
					props.nextPageCursor
						? withQueryParams(url, { cursor: props.nextPageCursor })
						: undefined
				}
				firstHref={
					props.cursor
						? withQueryParams(url, { cursor: undefined })
						: undefined
				} />
		</div>
	)
}
