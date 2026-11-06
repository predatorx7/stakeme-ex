import { Layout } from '../components/Layout.tsx'
import { DividendsListPage } from '../components/lists/CreatorListPage.tsx'
import { listCreatorDividends } from '../queries.ts'
import type { DividendsPage } from '../types/index.ts'
import type { ITypedExpressRequest } from '../types/openapi.ts'
import { shouldSendJson } from '../utils/negotiation.ts'
import {
	cursorParams,
	LIST_PAGE_SIZE,
	pageQuery,
	toPage,
} from '../utils/pagination.ts'

/** `GET /creators/{ticker}/dividends` — a creator's dividends, paged. */
export default async function ListCreatorDividends(
	req: ITypedExpressRequest<'ListCreatorDividends'>,
) {
	const { ticker } = req.params
	const [row] = await pageQuery(
		listCreatorDividends.run(
			{ ticker, limit: LIST_PAGE_SIZE, ...cursorParams(req.query.cursor) },
			req.pg,
		),
	)
	const page = toPage<DividendsPage>(row.j)
	if(shouldSendJson(req)) {
		req.res!.json(page)
		return
	}

	return (
		<Layout
			seo={{ title: `$${ticker} dividends`, robots: 'noindex, follow' }}
			viewer={req.authMetadata}
			nav='exchange'>
			<DividendsListPage
				{...page}
				cursor={req.query.cursor}
				url={req.originalUrl} />
		</Layout>
	)
}
