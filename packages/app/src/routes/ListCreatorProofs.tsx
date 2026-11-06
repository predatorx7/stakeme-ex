import { Layout } from '../components/Layout.tsx'
import { ProofsListPage } from '../components/lists/CreatorListPage.tsx'
import { listCreatorProofs } from '../queries.ts'
import type { ProofsPage } from '../types/index.ts'
import type { ITypedExpressRequest } from '../types/openapi.ts'
import { shouldSendJson } from '../utils/negotiation.ts'
import {
	cursorParams,
	LIST_PAGE_SIZE,
	pageQuery,
	toPage,
} from '../utils/pagination.ts'

/** `GET /creators/{ticker}/proofs` — a creator's income proofs, paged. */
export default async function ListCreatorProofs(
	req: ITypedExpressRequest<'ListCreatorProofs'>,
) {
	const { ticker } = req.params
	const [row] = await pageQuery(
		listCreatorProofs.run(
			{ ticker, limit: LIST_PAGE_SIZE, ...cursorParams(req.query.cursor) },
			req.pg,
		),
	)
	const page = toPage<ProofsPage>(row.j)
	if(shouldSendJson(req)) {
		req.res!.json(page)
		return
	}

	return (
		<Layout
			seo={{ title: `$${ticker} income proofs`, robots: 'noindex, follow' }}
			viewer={req.authMetadata}
			nav='exchange'>
			<ProofsListPage
				{...page}
				cursor={req.query.cursor}
				url={req.originalUrl} />
		</Layout>
	)
}
