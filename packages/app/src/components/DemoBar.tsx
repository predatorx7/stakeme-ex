import { demoPresenterWallets } from '../consts.ts'
import { escapeText } from '../utils/escape.ts'

const TICKER = 'MUSH'

/** Prefill payloads: `{ form: css selector, values: { name: value } }`. */
const LAUNCH_PREFILL = {
	form: '#launch-form',
	values: {
		ticker: TICKER,
		displayName: 'Mushaheed Syed',
		headline: 'Software developer building open-source dev tools',
		targetRaise: '10000.00',
		stakeAmount: '500.00',
		sharePct: 5,
		termMonths: 60,
		trancheSchedule: '20-40-40',
		proofCadence: 'MONTHLY',
		social_x: 'https://x.com/_predatorx7',
		social_github: 'https://github.com/predatorx7',
	},
}
const TICKET_PREFILL = {
	form: '[data-order-ticket] form',
	values: { side: 'BUY', amountIn: '100.00' },
}
const INVEST_PREFILL = {
	form: 'form[action$="/investments"]',
	values: { usdcAmount: '100.00' },
}
/** Filled into the bank tab (same origin). Any non-empty login works. */
const BANK_PREFILL = {
	form: 'form[action="/mock-bank/login"]',
	values: {
		username: 'mushaheed',
		password: 'demo-password',
		scenario: 'salary',
	},
}

const STEPS = [
	{ label: 'Launch', href: '/launch' },
	{ label: 'Raise', href: '/hub' },
	{ label: 'Dividend', href: '/hub' },
	{ label: 'Invest', href: `/creators/${TICKER}` },
	{ label: 'Reset', href: '/launch' },
]

/** Wallets allowed to run the helper routes (`DEMO_PRESENTER_WALLETS`). */
export function isDemoPresenter(wallet: string | null | undefined) {
	return !!wallet && demoPresenterWallets().includes(wallet.toLowerCase())
}

/**
 * Demo run-of-show bar, fixed to the bottom of the viewport. Rendered only
 * when `DEMO_MODE=1`, outside the swapped page shell so it survives
 * navigation. `client/demo.ts` picks the current step from the path and
 * handles the buttons; `demo.css` styles it.
 */
export function DemoBar({ presenter }: { presenter: boolean }) {
	return (
		<>
			<aside
				class='demo-bar'
				data-demo-bar
				data-open='true'
				data-step='1'
				aria-label='Demo mode'>
				<div class='demo-start'>
					<strong class='demo-title'>
						Demo mode
					</strong>
					<ol class='demo-chips'>
						{
							STEPS.map((s, i) => (
								<li>
									<button
										type='button'
										class='demo-chip'
										data-demo-step={String(i + 1)}
										data-href={s.href}
										aria-label={`Step ${i + 1}: ${s.label}`}>
										<span class='demo-chip-n'>
											{i + 1}
										</span>
										<span class='demo-chip-label'>
											{escapeText(s.label)}
										</span>
									</button>
								</li>
							))
						}
					</ol>
				</div>
				<div
					class='demo-actions'
					id='demo-actions'>
					<div
						class='demo-panel'
						data-panel='1'>
						<button
							type='button'
							class='rc-button demo-btn'
							data-demo-prefill={JSON.stringify(LAUNCH_PREFILL)}>
							Prefill launch form
						</button>
						<span class='demo-hint'>
							Then verify with World ID and sign in MetaMask (account A).
						</span>
					</div>
					<div
						class='demo-panel'
						data-panel='2'>
						{
							presenter && (
								<button
									type='button'
									class='rc-button demo-btn'
									data-demo-post={`/demo/creators/${TICKER}/fill-raise`}>
									Fill the raise with demo investors
								</button>
							)
						}
						<button
							type='button'
							class='rc-button demo-btn'
							data-demo-bank={JSON.stringify(BANK_PREFILL)}>
							Submit bank proof
						</button>
						<span class='demo-hint'>
							Opens the bank in a new tab. Or use Simulate deposit.
						</span>
					</div>
					<div
						class='demo-panel'
						data-panel='3'>
						<span class='demo-hint'>
							Pay the dividend with the USDC pay button on this page.
						</span>
					</div>
					<div
						class='demo-panel'
						data-panel='4'>
						<span class='demo-hint'>
							Switch to account B in MetaMask.
						</span>
						<button
							type='button'
							class='rc-button demo-btn'
							data-demo-prefill={JSON.stringify(TICKET_PREFILL)}>
							Prefill order ticket
						</button>
						<button
							type='button'
							class='rc-button demo-btn'
							data-demo-prefill={JSON.stringify(INVEST_PREFILL)}>
							Prefill invest form
						</button>
						<a
							class='rc-button demo-btn'
							href='/portfolio'>
							Open portfolio
						</a>
					</div>
					<div
						class='demo-panel'
						data-panel='5'>
						<span class='demo-hint'>
							Reset the $
							{TICKER}
							{' '}
							demo, then start again from Launch.
						</span>
						{
							presenter && (
								<button
									type='button'
									class='rc-button demo-btn demo-reset-m'
									data-demo-reset={TICKER}>
									{`Reset $${TICKER} demo`}
								</button>
							)
						}
					</div>
					<p
						class='demo-status'
						data-demo-status
						role='status'
						aria-live='polite' />
				</div>
				<div class='demo-end'>
					<button
						type='button'
						class='rc-button demo-btn demo-more'
						data-demo-more
						aria-controls='demo-actions'
						aria-expanded='false'>
						Actions
					</button>
					<a
						class='rc-button demo-btn demo-next'
						data-demo-next
						href='/hub'>
						Next step →
					</a>
					{
						presenter && (
							<button
								type='button'
								class='rc-button demo-btn demo-reset'
								data-demo-reset={TICKER}>
								{`Reset $${TICKER}`}
							</button>
						)
					}
					<button
						type='button'
						class='rc-button demo-btn demo-collapse'
						data-demo-collapse
						aria-label='Collapse demo bar'
						title='Collapse'>
						▾
					</button>
				</div>
			</aside>
			<button
				type='button'
				class='rc-button demo-tab'
				data-demo-tab
				hidden>
				Demo mode ▴
			</button>
		</>
	)
}
