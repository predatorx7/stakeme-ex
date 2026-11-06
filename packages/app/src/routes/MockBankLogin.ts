import { canonicalOrigin } from '../consts.ts'
import {
	BANK_COOKIE,
	createBankSession,
	parseScenario,
} from '../services/mock-bank.ts'
import type { ITypedExpressRequest } from '../types/openapi.ts'

/** `POST /mock-bank/login` — any non-empty credentials; sets the cookie. */
export default function MockBankLogin(
	req: ITypedExpressRequest<'MockBankLogin'>,
) {
	const token = createBankSession(
		req.body.username,
		parseScenario(req.body.scenario),
	)
	req.res!.cookie(BANK_COOKIE, token, {
		httpOnly: true,
		sameSite: 'lax',
		path: '/mock-bank',
		secure: canonicalOrigin().startsWith('https://'),
		maxAge: 12 * 60 * 60 * 1000,
	})
	req.res!.redirect(303, '/mock-bank')
}
