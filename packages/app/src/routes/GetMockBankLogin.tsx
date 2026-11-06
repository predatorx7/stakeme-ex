import { MockBankLoginPage } from '../components/pages/MockBankPage.tsx'
import { getBankSession } from '../services/mock-bank.ts'
import type { ITypedExpressRequest } from '../types/openapi.ts'

/** `GET /mock-bank/login` — fake bank sign-in form. */
export default function GetMockBankLogin(
	req: ITypedExpressRequest<'GetMockBankLogin'>,
) {
	if(getBankSession(req.headers.cookie)) {
		req.res!.redirect(302, '/mock-bank')
		return
	}

	return <MockBankLoginPage />
}
