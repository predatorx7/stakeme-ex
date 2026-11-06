import {
	CreatorUpdatesListPage
} from '../components/creator/CreatorUpdates.tsx'
import { Layout } from '../components/Layout.tsx'
import { listCreatorUpdates } from '../queries.ts'
import type { CreatorUpdatesPage } from '../types/index.ts'
import type { ITypedExpressRequest } from '../types/openapi.ts'
import { shouldSendJson } from '../utils/negotiation.ts'
import {
	cursorParams,
	LIST_PAGE_SIZE,
	pageQuery,
	toPage,
} from '../utils/pagination.ts'

/** `GET /creators/{ticker}/updates` — a creator's updates, newest first. */
export default async function ListCreatorUpdates(
	req: ITypedExpressRequest<'ListCreatorUpdates'>,
) {
	const { ticker } = req.params
	const [row] = await pageQuery(
		listCreatorUpdates.run(
			{ ticker, limit: LIST_PAGE_SIZE, ...cursorParams(req.query.cursor) },
			req.pg,
		),
	)
	const page = toPage<CreatorUpdatesPage>(row.j)
	if(shouldSendJson(req)) {
		req.res!.json(page)
		return
	}

	return (
		<Layout
			seo={{ title: `$${ticker} updates`, robots: 'noindex, follow' }}
			viewer={req.authMetadata}
			nav='exchange'>
			<CreatorUpdatesListPage
				{...page}
				cursor={req.query.cursor}
				url={req.originalUrl} />
		</Layout>
	)
}
