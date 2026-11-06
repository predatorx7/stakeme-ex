import { Layout } from '../components/Layout.tsx'
import { HoldersListPage } from '../components/lists/CreatorListPage.tsx'
import { listCreatorHolders } from '../queries.ts'
import type { HoldersPage } from '../types/index.ts'
import type { ITypedExpressRequest } from '../types/openapi.ts'
import { shouldSendJson } from '../utils/negotiation.ts'
import {
	cursorParams,
	LIST_PAGE_SIZE,
	pageQuery,
	toPage,
} from '../utils/pagination.ts'

/** `GET /creators/{ticker}/holders` — a creator's holders, paged. */
export default async function ListCreatorHolders(
	req: ITypedExpressRequest<'ListCreatorHolders'>,
) {
	const { ticker } = req.params
	const [row] = await pageQuery(
		listCreatorHolders.run(
			{ ticker, limit: LIST_PAGE_SIZE, ...cursorParams(req.query.cursor) },
			req.pg,
		),
	)
	const page = toPage<HoldersPage>(row.j)
	if(shouldSendJson(req)) {
		req.res!.json(page)
		return
	}

	return (
		<Layout
			seo={{ title: `$${ticker} holders`, robots: 'noindex, follow' }}
			viewer={req.authMetadata}
			nav='exchange'>
			<HoldersListPage
				{...page}
				viewerWallet={req.authMetadata?.walletAddress}
				cursor={req.query.cursor}
				url={req.originalUrl} />
		</Layout>
	)
}
