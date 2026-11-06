import { Boom } from '@hapi/boom'
import { buildStatement, getBankSession } from '../services/mock-bank.ts'
import type { ITypedExpressRequest } from '../types/openapi.ts'

/** `GET /mock-bank/api/transactions` — statement JSON, cookie required. */
export default function GetMockBankTransactions(
	req: ITypedExpressRequest<'GetMockBankTransactions'>,
) {
	const session = getBankSession(req.headers.cookie)
	if(!session) {
		throw new Boom('Not signed in', { statusCode: 401 })
	}

	req.res!.set('Cache-Control', 'no-store')
	req.res!.json(buildStatement(session.holderName, session.scenario))
}
