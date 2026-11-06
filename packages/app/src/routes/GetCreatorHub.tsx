import { Layout } from '../components/Layout.tsx'
import { CreatorHubPage } from '../components/pages/CreatorHubPage.tsx'
import { getCreatorHub } from '../queries.ts'
import type { CreatorHub } from '../types/index.ts'
import type { ITypedExpressRequest } from '../types/openapi.ts'
import { typed } from '../utils/json.ts'
import { shouldSendJson } from '../utils/negotiation.ts'

/** `GET /hub` — the viewer's creator dashboard (auth required). */
export default async function GetCreatorHub(
	req: ITypedExpressRequest<'GetCreatorHub'>,
) {
	const [row] = await getCreatorHub.run(
		{ viewer_id: req.authMetadata!.id },
		req.pg,
	)
	if(shouldSendJson(req)) {
		req.res!.json(row.j)
		return
	}

	return (
		<Layout
			seo={{ title: 'Creator hub', robots: 'noindex, nofollow' }}
			viewer={req.authMetadata}
			nav='hub'>
			<CreatorHubPage hub={typed<CreatorHub>(row.j)} />
		</Layout>
	)
}
