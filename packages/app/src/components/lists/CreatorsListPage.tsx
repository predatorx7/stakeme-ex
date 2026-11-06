import type { CreatorSummary } from '../../types/index.ts'
import { escapeText } from '../../utils/escape.ts'
import { withQueryParams } from '../../utils/http.ts'
import { formatUsdc } from '../../utils/money.ts'
import { Sparkline } from '../charts/Sparkline.tsx'
import { CreatorStatusBadge, isEscrowFrozen } from '../CreatorStatus.tsx'
import { DataTable } from '../DataTable.tsx'
import { EmptyState } from '../EmptyState.tsx'
import { PageHeader } from '../PageHeader.tsx'
import { PriceChange } from '../PriceChange.tsx'
import { SectionCard } from '../SectionCard.tsx'
import { LIST_BODY_ID, Pager } from './Pager.tsx'

const SORTS = [
	{ value: 'trending', label: 'Trending' },
	{ value: 'newest', label: 'Newest' },
	{ value: 'raised', label: 'Most raised' },
]

const STATUSES = [
	{ value: 'all', label: 'All' },
	{ value: 'live', label: 'Live' },
	{ value: 'grace', label: 'Grace' },
	{ value: 'defaulted', label: 'Defaulted' },
]

type Props = {
	items: CreatorSummary[]
	nextPageCursor?: string
	sort: string
	status: string
	q: string
	cursor?: string
	/** The request URL, so page links keep the filters. */
	url: string
}

/** `GET /creators`: every creator with sort, status filter and search. */
export function CreatorsListPage(props: Props) {
	const { items, sort, status, q, url } = props
	const filtered = status !== 'all' || !!q
	return (
		<div class='smx-page'>
			<PageHeader
				title='Creators'
				lede='Every human on the exchange.' />
			<SectionCard title='All creators'>
				<form
					class='rc-filter-toolbar smx-filters'
					method='get'
					action='/creators'
					role='search'>
					<div class='rc-filter-toolbar__controls'>
						<div class='rc-filter-toolbar__field'>
							<label
								class='rc-label'
								for='creators-q'>
								Search
							</label>
							<input
								id='creators-q'
								class='rc-input'
								type='search'
								name='q'
								value={q}
								maxlength='80'
								placeholder='Ticker or name' />
						</div>
						<div class='rc-filter-toolbar__field'>
							<label
								class='rc-label'
								for='creators-sort'>
								Sort
							</label>
							<select
								id='creators-sort'
								class='rc-select'
								name='sort'>
								{
									SORTS.map((o) => (
										<option
											value={o.value}
											selected={o.value === sort}>
											{escapeText(o.label)}
										</option>
									))
								}
							</select>
						</div>
						<div class='rc-filter-toolbar__field'>
							<label
								class='rc-label'
								for='creators-status'>
								Status
							</label>
							<select
								id='creators-status'
								class='rc-select'
								name='status'>
								{
									STATUSES.map((o) => (
										<option
											value={o.value}
											selected={o.value === status}>
											{escapeText(o.label)}
										</option>
									))
								}
							</select>
						</div>
						<div class='rc-filter-toolbar__actions'>
							{
								filtered && (
									<a
										class='rc-button'
										href='/creators'>
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
								title={filtered ? 'No creators match' : 'No creators yet'}
								hint={
									filtered
										? 'Try another search or clear the filters.'
										: 'Launched IPOs appear here.'
								} />
						)
						: (
							<DataTable
								caption='Creators'
								bodyId={LIST_BODY_ID}
								columns={
									[
										{ label: 'Creator' },
										{ label: 'Price', align: 'end' },
										{ label: '24h', align: 'end' },
										{ label: 'Raised', align: 'end', col: 'share' },
										{ label: 'Trend', col: 'spark' },
										{ label: 'Status', col: 'status' },
									]
								}>
								{items.map((c) => <CreatorRow creator={c} />)}
							</DataTable>
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

function CreatorRow({ creator: c }: { creator: CreatorSummary }) {
	return (
		<tr>
			<td>
				<a
					class='smx-who'
					href={`/creators/${c.ticker}`}>
					<span>
						<strong class='smx-ticker'>
							{escapeText(`$${c.ticker}`)}
						</strong>
						<small>
							{escapeText(`${c.displayName}, ${c.headline}`)}
						</small>
					</span>
				</a>
			</td>
			<td
				data-align='end'
				data-price-flash
				data-price={c.price}
				data-price-key={`creators:${c.ticker}`}>
				{escapeText(formatUsdc(c.price, 4))}
			</td>
			<td data-align='end'>
				<PriceChange value={c.change24h} />
			</td>
			<td
				data-align='end'
				data-col='share'>
				{escapeText(`${formatUsdc(c.raised)} of ${formatUsdc(c.targetRaise)}`)}
			</td>
			<td data-col='spark'>
				<Sparkline
					points={c.sparkline}
					name={c.ticker}
					area />
			</td>
			<td data-col='status'>
				<CreatorStatusBadge
					status={c.status}
					frozen={isEscrowFrozen(c.status)} />
			</td>
		</tr>
	)
}
