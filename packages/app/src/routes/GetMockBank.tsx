import { MockBankPage } from '../components/pages/MockBankPage.tsx'
import { buildStatement, getBankSession } from '../services/mock-bank.ts'
import type { ITypedExpressRequest } from '../types/openapi.ts'

/**
 * `GET /mock-bank` — statement page. Redirects to the login without the bank
 * cookie. The page renders server-side and then re-fetches
 * `/mock-bank/api/transactions` so the call shows up in network capture.
 */
export default function GetMockBank(req: ITypedExpressRequest<'GetMockBank'>) {
	const session = getBankSession(req.headers.cookie)
	if(!session) {
		req.res!.redirect(302, '/mock-bank/login')
		return
	}

	return (
		<MockBankPage
			bank={buildStatement(session.holderName, session.scenario)} />
	)
}
