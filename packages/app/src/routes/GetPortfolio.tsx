import { unauthorized } from '@hapi/boom'
import assert from 'node:assert'
import { Layout } from '../components/Layout.tsx'
import {
	PortfolioPage,
	PortfolioSignedOut,
} from '../components/pages/PortfolioPage.tsx'
import {
	canRequestTestUsdc,
	isChainConfigured,
	readWalletFunds,
} from '../integrations/chain.ts'
import { getPortfolio, listWalletTransactions } from '../queries.ts'
import type { Portfolio } from '../types/index.ts'
import type { ITypedExpressRequest } from '../types/openapi.ts'
import { shouldSendJson } from '../utils/negotiation.ts'
import {
	cursorParams,
	LIST_PAGE_SIZE,
	pageQuery,
	toPage,
} from '../utils/pagination.ts'

/**
 * `GET /portfolio` — the viewer's funds, holdings, transactions and
 * dividends. Signed out, the page asks for a wallet; JSON callers get 401.
 */
export default async function GetPortfolio(
	req: ITypedExpressRequest<'GetPortfolio'>,
) {
	const viewer = req.authMetadata
	const json = shouldSendJson(req)
	if(!viewer) {
		assert(!json, unauthorized('Sign in to see your portfolio'))
		return (
			<Layout
				seo={{ title: 'Portfolio', robots: 'noindex, nofollow' }}
				viewer={undefined}
				nav='portfolio'>
				<PortfolioSignedOut />
			</Layout>
		)
	}

	const wallet = viewer.walletAddress ?? null
	const [[row], txs, funds] = await Promise.all([
		getPortfolio.run({ wallet, user_id: viewer.id }, req.pg),
		wallet
			? pageQuery(
				listWalletTransactions.run(
					{ wallet, limit: LIST_PAGE_SIZE, ...cursorParams(req.query.cursor) },
					req.pg,
				),
			).then(([r]) => toPage<Portfolio['transactions']>(r.j))
			: { items: [] },
		wallet
			? readWalletFunds(wallet)
			: { status: 'UNAVAILABLE' as const },
	])
	const portfolio = {
		...(row.j as Omit<Portfolio, 'funds' | 'transactions'>),
		funds: { ...funds, canRequestUsdc: canRequestTestUsdc() },
		transactions: txs,
	} as Portfolio
	if(json) {
		req.res!.json(portfolio)
		return
	}

	return (
		<Layout
			seo={{ title: 'Portfolio', robots: 'noindex, nofollow' }}
			viewer={viewer}
			nav='portfolio'>
			<PortfolioPage
				portfolio={portfolio}
				live={isChainConfigured()}
				url={req.originalUrl}
				cursor={req.query.cursor} />
		</Layout>
	)
}
