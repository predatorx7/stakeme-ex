import { escapeText } from '../../utils/escape.ts'
import { navLink } from '../nav-swap.ts'
import { type Segment, segmentsTitle, total } from './segments.ts'

type Row = {
	label: string
	segments: Segment[]
	display?: string
	/** The page of the thing the label names. */
	href?: string
	/** The sessions behind the count. Also the label's link without `href`. */
	listHref?: string
}

/** Horizontal bars with a label on the left and the total after each bar. */
export function BarList({ name, rows }: { name: string, rows: Row[] }) {
	const totals = rows.map(({ segments }) => total(segments))
	const longest = Math.max(1, ...totals)

	return (
		<ol
			class='rc-bar-list'
			aria-label={name}>
			{
				rows.map((row, index) => (
					<li title={segmentsTitle(row.label, row.segments)}>
						<span class='rc-bar-list__label'>
							{
								(row.href ?? row.listHref)
									? (
										<a
											{...navLink((row.href ?? row.listHref)!)}
											safe>
											{row.label}
										</a>
									)
									: escapeText(row.label)
							}
						</span>
						<span class='rc-bar-list__track'>
							<span
								class='rc-bar-list__bar'
								style={`--share: ${totals[index] / longest}`}>
								{
									row.segments
										.filter((segment) => segment.value > 0)
										.map((segment) => (
											<span
												data-tone={segment.tone}
												style={`flex-grow: ${segment.value}`} />
										))
								}
							</span>
							<span class='rc-bar-list__value'>
								{
									row.listHref
										? (
											<a {...navLink(row.listHref)}>
												{
													escapeText(
														row.display ?? totals[index].toLocaleString('en-US')
													)
												}
											</a>
										)
										: escapeText(
											row.display ?? totals[index].toLocaleString('en-US')
										)
								}
							</span>
						</span>
					</li>
				))
			}
		</ol>
	)
}
