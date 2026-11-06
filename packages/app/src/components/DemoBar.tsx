import { demoPresenterWallets } from '../consts.ts'

/** Wallets allowed to run the helper routes (`DEMO_PRESENTER_WALLETS`). */
export function isDemoPresenter(wallet: string | null | undefined) {
	return !!wallet && demoPresenterWallets().includes(wallet.toLowerCase())
}

/**
 * Demo run-of-show bar, fixed to the bottom of the viewport. Rendered only
 * when `DEMO_MODE=1`, outside the swapped page shell so it survives
 * navigation. `client/demo.ts` owns the step table (`demo-fill.ts`), fills the
 * label, outcome options and hints, and runs the four controls; `demo.css`
 * styles it.
 */
export function DemoBar({ presenter }: { presenter: boolean }) {
	return (
		<>
			<aside
				class='demo-bar'
				data-demo-bar
				data-open='true'
				data-presenter={String(presenter)}
				aria-label='Demo mode'>
				<div class='demo-start'>
					<button
						type='button'
						class='rc-button demo-btn demo-reset'
						data-demo-reset
						disabled={!presenter}
						title={presenter ? 'Back to step 1' : 'Presenter wallet only'}>
						Reset
					</button>
					<strong
						class='demo-label'
						data-demo-label>
						Step 1/8
					</strong>
				</div>
				<div
					class='demo-actions'
					id='demo-actions'>
					<p
						class='demo-status'
						data-demo-status
						role='status'
						aria-live='polite' />
					<button
						type='button'
						class='rc-button demo-btn'
						data-demo-prefill>
						Prefill
					</button>
					<select
						class='rc-select demo-outcome'
						data-demo-outcome
						aria-label='Outcome'
						hidden />
				</div>
				<div class='demo-end'>
					<button
						type='button'
						class='rc-button demo-btn demo-more'
						data-demo-more
						aria-controls='demo-actions'
						aria-expanded='false'>
						Options
					</button>
					<button
						type='button'
						class='rc-button demo-btn demo-next'
						data-variant='primary'
						data-demo-next>
						Continue →
					</button>
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
