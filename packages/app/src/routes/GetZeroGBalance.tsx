import { ZeroGBalance } from '../components/ZeroGBalance.tsx'
import { getRouterBalance } from '../integrations/zero-g.ts'
import type { ITypedExpressRequest } from '../types/openapi.ts'
import { shouldSendJson } from '../utils/negotiation.ts'

/** Micro-USD (integer string) as a USD decimal with 6 places. */
function toUsd(micro: string) {
	const s = micro.padStart(7, '0')
	return `${s.slice(0, -6)}.${s.slice(-6)}`
}

/**
 * `GET /api/zero-g/balance` — the 0G Router credit that pays for the audit.
 * Read server-side with the management key (cached about 30 s); the key never
 * reaches the browser. Serves the htmx readout or JSON.
 */
export default async function GetZeroGBalance(
	req: ITypedExpressRequest<'GetZeroGBalance'>,
) {
	const balance = await getRouterBalance()
	const doc = balance
		? {
			configured: true,
			address: balance.address ?? undefined,
			creditMicroUsd: balance.totalMicroUsd,
			creditUsd: toUsd(balance.totalMicroUsd),
		}
		: { configured: false }
	if(shouldSendJson(req)) {
		req.res!.json(doc)
		return
	}

	return <ZeroGBalance balance={doc} />
}
