import { notFound } from '@hapi/boom'
import assert from 'node:assert'
import { Layout } from '../components/Layout.tsx'
import { CreatorPage } from '../components/pages/CreatorPage.tsx'
import { canonicalOrigin } from '../consts.ts'
import { getCreatorPage } from '../queries.ts'
import type { CreatorPage as CreatorPageData } from '../types/index.ts'
import type { ITypedExpressRequest } from '../types/openapi.ts'
import { typed } from '../utils/json.ts'
import { shouldSendJson } from '../utils/negotiation.ts'

/** `GET /creators/{ticker}` — token page document. */
export default async function GetCreator(
	req: ITypedExpressRequest<'GetCreator'>,
) {
	const [row] = await getCreatorPage.run(
		{
			ticker: req.params.ticker,
			wallet: req.authMetadata?.walletAddress ?? null,
		},
		req.pg,
	)
	assert(row?.j, notFound('Creator not found'))
	if(shouldSendJson(req)) {
		req.res!.json(row.j)
		return
	}

	const page = typed<CreatorPageData>(row.j)
	return (
		<Layout
			seo={
				{
					title: `$${page.creator.ticker} ${page.creator.displayName}`,
					description: page.creator.headline,
					canonical: `${canonicalOrigin()}/creators/${page.creator.ticker}`,
				}
			}
			viewer={req.authMetadata}
			nav='exchange'>
			<CreatorPage page={page} />
		</Layout>
	)
}
