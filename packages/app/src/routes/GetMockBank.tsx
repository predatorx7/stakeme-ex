import { Layout } from '../components/Layout.tsx'
import { MockBankPage } from '../components/pages/MockBankPage.tsx'
import type { MockBank } from '../types/index.ts'
import type { ITypedExpressRequest } from '../types/openapi.ts'
import { shouldSendJson } from '../utils/negotiation.ts'

/**
 * `GET /mock-bank` — a fake statement with a fixed $5,000 deposit. The Reclaim
 * provider reads it, so the figures are hardcoded and need no database.
 */
export default function GetMockBank(req: ITypedExpressRequest<'GetMockBank'>) {
	const today = new Date().toISOString().slice(0, 10)
	const bank: MockBank = {
		account: 'SMX Demo Checking ****4242',
		balance: '12957.50',
		transactions: [
			{
				id: 'txn_0001',
				date: today,
				description: 'Acme Studio freelance income',
				amount: '5000.00',
				type: 'DEPOSIT',
			},
			{
				id: 'txn_0002',
				date: today,
				description: 'Cloud hosting',
				amount: '42.50',
				type: 'WITHDRAWAL',
			},
		],
	}
	if(shouldSendJson(req)) {
		req.res!.json(bank)
		return
	}

	return (
		<Layout
			seo={{ title: 'Mock bank', robots: 'noindex, nofollow' }}
			viewer={req.authMetadata}>
			<MockBankPage bank={bank} />
		</Layout>
	)
}
