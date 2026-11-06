import { BANK_COOKIE, createBankSession } from '../services/mock-bank.ts'
import type { ITypedExpressRequest } from '../types/openapi.ts'

/** `POST /mock-bank/login` — any non-empty credentials; sets the cookie. */
export default function MockBankLogin(
	req: ITypedExpressRequest<'MockBankLogin'>,
) {
	const token = createBankSession(req.body.username)
	req.res!.cookie(BANK_COOKIE, token, {
		httpOnly: true,
		sameSite: 'lax',
		path: '/mock-bank',
		secure: req.protocol === 'https',
		maxAge: 12 * 60 * 60 * 1000,
	})
	req.res!.redirect(303, '/mock-bank')
}
