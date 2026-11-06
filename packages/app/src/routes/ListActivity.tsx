import { Layout } from '../components/Layout.tsx'
import { ActivityListPage } from '../components/lists/ActivityListPage.tsx'
import { listActivity } from '../queries.ts'
import type { ActivityPage } from '../types/index.ts'
import type { ITypedExpressRequest } from '../types/openapi.ts'
import { shouldSendJson } from '../utils/negotiation.ts'
import {
	ACTIVITY_PAGE_SIZE,
	cursorParams,
	pageQuery,
	toPage,
} from '../utils/pagination.ts'

/** `GET /activity` — the oracle event history, paged. (`/events` is the SSE
 *  stream.) */
export default async function ListActivity(
	req: ITypedExpressRequest<'ListActivity'>,
) {
	const { kind = 'all', ticker = '', cursor } = req.query
	const [row] = await pageQuery(
		listActivity.run(
			{
				kind: kind === 'all' ? null : kind,
				ticker: ticker.toUpperCase() || null,
				limit: ACTIVITY_PAGE_SIZE,
				...cursorParams(cursor),
			},
			req.pg,
		),
	)
	const page = toPage<ActivityPage>(row.j)
	if(shouldSendJson(req)) {
		req.res!.json(page)
		return
	}

	return (
		<Layout
			seo={{ title: 'Activity', description: 'Oracle events, newest first.' }}
			viewer={req.authMetadata}
			nav='activity'>
			<ActivityListPage
				{...page}
				kind={kind}
				ticker={ticker.toUpperCase()}
				cursor={cursor}
				url={req.originalUrl} />
		</Layout>
	)
}
