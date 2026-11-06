import { Layout } from '../components/Layout.tsx'
import { CreatorsListPage } from '../components/lists/CreatorsListPage.tsx'
import { listCreators } from '../queries.ts'
import type { CreatorsPage } from '../types/index.ts'
import type { ITypedExpressRequest } from '../types/openapi.ts'
import { shouldSendJson } from '../utils/negotiation.ts'
import {
	cursorParams,
	LIST_PAGE_SIZE,
	pageQuery,
	toPage,
} from '../utils/pagination.ts'

/** `GET /creators` — every creator: sort, status filter, search, paged. */
export default async function ListCreators(
	req: ITypedExpressRequest<'ListCreators'>,
) {
	const { sort = 'trending', status = 'all', q = '', cursor } = req.query
	const [row] = await pageQuery(
		listCreators.run(
			{
				sort,
				status: status === 'all' ? null : status,
				q: q.trim() || null,
				limit: LIST_PAGE_SIZE,
				...cursorParams(cursor),
			},
			req.pg,
		),
	)
	const page = toPage<CreatorsPage>(row.j)
	if(shouldSendJson(req)) {
		req.res!.json(page)
		return
	}

	return (
		<Layout
			seo={{ title: 'Creators', description: 'Every creator on the exchange.' }}
			viewer={req.authMetadata}
			nav='creators'>
			<CreatorsListPage
				{...page}
				sort={sort}
				status={status}
				q={q}
				cursor={cursor}
				url={req.originalUrl} />
		</Layout>
	)
}
