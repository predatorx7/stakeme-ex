import { badRequest } from '@hapi/boom'
import assert from 'node:assert'
import { Layout } from '../components/Layout.tsx'
import { LaunchPage } from '../components/pages/LaunchPage.tsx'
import {
	DEFAULT_MIN_INCOME,
	DEFAULT_SHARE_BPS,
	DEFAULT_TERM_MONTHS,
	DEFAULT_TRANCHE_BPS,
	WORLD_ACTION,
	WORLD_APP_ID,
	WORLD_RP_ID,
} from '../consts.ts'
import { getLaunchState } from '../queries.ts'
import type { LaunchState } from '../types/index.ts'
import type { ITypedExpressRequest } from '../types/openapi.ts'
import { shouldSendJson } from '../utils/negotiation.ts'

/** `GET /launch` — IPO form state (auth required). */
export default async function GetLaunch(
	req: ITypedExpressRequest<'GetLaunch'>,
) {
	const viewer = req.authMetadata!
	assert(viewer.walletAddress, badRequest('Link a wallet to launch an IPO'))
	const [existing] = await getLaunchState.run({ viewer_id: viewer.id }, req.pg)
	const state: LaunchState = {
		wallet: viewer.walletAddress,
		hasCreator: !!existing,
		ticker: existing?.ticker,
		defaults: {
			shareBps: DEFAULT_SHARE_BPS,
			termMonths: DEFAULT_TERM_MONTHS,
			trancheBps: DEFAULT_TRANCHE_BPS,
			minIncome: DEFAULT_MIN_INCOME,
		},
		worldId: {
			appId: WORLD_APP_ID || undefined,
			rpId: WORLD_RP_ID || undefined,
			action: WORLD_ACTION,
			simulated: !WORLD_APP_ID,
		},
	}
	if(shouldSendJson(req)) {
		req.res!.json(state)
		return
	}

	return (
		<Layout
			seo={{ title: 'Launch your IPO', robots: 'noindex, nofollow' }}
			viewer={viewer}
			nav='launch'>
			<LaunchPage state={state} />
		</Layout>
	)
}
