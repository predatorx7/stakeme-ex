import { type Children, escapeHtml } from '@kitajs/html'

type Column = {
	label: string
	align?: 'end'
	/** For a column with no visible heading, such as row actions. */
	hidden?: boolean
	/** Column key (`data-col`), so CSS can drop the column on small screens. */
	col?: string
}

/** A scrolling `rc-table` with a captioned header. Rows go in as children. */
export function DataTable({ caption, columns, bordered, framed, children }: {
	caption: string
	/** Draws the table's own border and panel, with ordinary rows. */
	framed?: boolean
	/** A table that stands alone rather than in a card: it gets its own border,
	 *  a wide minimum width, and rows that are one link. */
	bordered?: boolean
	columns: Column[]
	children: Children
}) {
	return (
		<div
			class={bordered ? 'rc-table-scroll verification-list' : 'rc-table-scroll'}
			data-bordered={bordered || framed ? '' : undefined}>
			<table class='rc-table'>
				<caption class='rc-visually-hidden'>
					{escapeHtml(caption)}
				</caption>
				<thead>
					<tr>
						{
							columns.map((column) => (
								<th
									scope='col'
									data-col={column.col}
									data-align={column.align}>
									<span
										class={column.hidden ? 'rc-visually-hidden' : undefined}>
										{escapeHtml(column.label)}
									</span>
								</th>
							))
						}
					</tr>
				</thead>
				<tbody>
					{children}
				</tbody>
			</table>
		</div>
	)
}
