import { Layout } from '../components/Layout.tsx'
import { TradesListPage } from '../components/lists/CreatorListPage.tsx'
import { listCreatorTrades } from '../queries.ts'
import type { TradesPage } from '../types/index.ts'
import type { ITypedExpressRequest } from '../types/openapi.ts'
import { shouldSendJson } from '../utils/negotiation.ts'
import {
	cursorParams,
	LIST_PAGE_SIZE,
	pageQuery,
	toPage,
} from '../utils/pagination.ts'

/** `GET /creators/{ticker}/trades` — a creator's trades, paged. */
export default async function ListCreatorTrades(
	req: ITypedExpressRequest<'ListCreatorTrades'>,
) {
	const { ticker } = req.params
	const [row] = await pageQuery(
		listCreatorTrades.run(
			{ ticker, limit: LIST_PAGE_SIZE, ...cursorParams(req.query.cursor) },
			req.pg,
		),
	)
	const page = toPage<TradesPage>(row.j)
	if(shouldSendJson(req)) {
		req.res!.json(page)
		return
	}

	return (
		<Layout
			seo={{ title: `$${ticker} trades`, robots: 'noindex, follow' }}
			viewer={req.authMetadata}
			nav='exchange'>
			<TradesListPage
				{...page}
				cursor={req.query.cursor}
				url={req.originalUrl} />
		</Layout>
	)
}
