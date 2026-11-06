import { Layout } from '../components/Layout.tsx'
import { ExchangePage } from '../components/pages/ExchangePage.tsx'
import { APP_NAME } from '../consts.ts'
import { getExchange } from '../queries.ts'
import type { Exchange } from '../types/index.ts'
import type { ITypedExpressRequest } from '../types/openapi.ts'
import { typed } from '../utils/json.ts'
import { shouldSendJson } from '../utils/negotiation.ts'

/** `GET /` — trending creators and the latest oracle events. */
export default async function GetExchange(
	req: ITypedExpressRequest<'GetExchange'>,
) {
	const [row] = await getExchange.run({ limit: req.query.limit ?? 20 }, req.pg)
	if(shouldSendJson(req)) {
		req.res!.json(row.j)
		return
	}

	return (
		<Layout
			seo={{ title: APP_NAME, titleAbsolute: true }}
			viewer={req.authMetadata}
			nav='exchange'>
			<ExchangePage exchange={typed<Exchange>(row.j)} />
		</Layout>
	)
}
