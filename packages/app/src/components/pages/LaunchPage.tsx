/* eslint-disable @stylistic/max-len -- deeply nested JSX copy */
import { DEMO_MODE } from '../../consts.ts'
import type { LaunchState } from '../../types/index.ts'
import { escapeText } from '../../utils/escape.ts'
import { shortHex } from '../../utils/money.ts'
import { Badge } from '../Badge.tsx'
import { EmptyState } from '../EmptyState.tsx'
import { Field } from '../forms/Field.tsx'
import { FormError } from '../forms/FormError.tsx'
import { HxForm } from '../forms/HxForm.tsx'
import { Hint } from '../Hint.tsx'
import { NumberedStep } from '../NumberedStep.tsx'
import { PageHeader } from '../PageHeader.tsx'
import { SectionCard } from '../SectionCard.tsx'

/**
 * IPO form. Two gates: a signed-in wallet (the route needs a session) and a
 * World ID proof (`client/world-id.ts` fills `worldIdProof` and enables the
 * submit button). `client/launch-form.ts` shapes the JSON body on submit.
 */
export function LaunchPage({ state }: { state: LaunchState }) {
	const { defaults, worldId } = state
	if(state.hasCreator) {
		return (
			<div class='smx-page'>
				<PageHeader
					eyebrow='Launch'
					title='Launch your IPO' />
				<EmptyState
					title={`You already launched $${state.ticker ?? ''}`}
					hint='Each World ID can launch one IPO.'>
					<a
						class='rc-button'
						data-variant='primary'
						href='/hub'>
						Open creator hub
					</a>
				</EmptyState>
			</div>
		)
	}

	const live = !worldId.simulated && !!worldId.appId
	return (
		<div class='smx-page'>
			<PageHeader
				eyebrow='Launch'
				title='Launch your IPO'
				lede={
					'Sell a share of your future income to investors. '
					+ 'Funds release in tranches as you prove income.'
				}
				meta={
					<>
						<Badge tone='success'>
							Wallet connected
						</Badge>
						<span
							class='smx-mono'
							data-wallet-address
							title={state.wallet}>
							{escapeText(shortHex(state.wallet))}
						</span>
					</>
				} />
			<div class='smx-layout'>
				<SectionCard
					title='IPO terms'
					context='These terms become your L-ISA, stored on 0G Storage.'
					plain>
					<div class='smx-body'>
						<HxForm
							action='/creators'
							ext='json-enc'
							class='smx-form'
							id='launch-form'>
							<div class='smx-fields'>
								<Field
									name='ticker'
									label='Ticker'
									required
									minlength={3}
									maxlength={6}
									pattern='[A-Z]{3,6}'
									placeholder='MUSH'
									hint='3 to 6 capital letters.' />
								<Field
									name='displayName'
									label='Display name'
									required
									maxlength={80}
									placeholder='Mushaheed' />
							</div>
							<Field
								name='headline'
								label='Headline'
								maxlength={280}
								placeholder='Software developer building open-source tools'
								hint='What you do, in one line.' />
							<div class='smx-fields'>
								<Field
									name='targetRaise'
									label='Target raise (USDC)'
									required
									placeholder='10000.00'
									pattern='[0-9]+(\.[0-9]{1,6})?' />
								<Field
									name='stakeAmount'
									label='Your stake (USDC)'
									required
									placeholder='500.00'
									pattern='[0-9]+(\.[0-9]{1,6})?'
									hint='Slashed to holders if you default.' />
								<Field
									name='sharePct'
									label='Income share (%)'
									required
									type='number'
									min={0.01}
									max={50}
									step='any'
									value={String(defaults.shareBps / 100)}
									hint='Share of your income paid to holders.' />
								<Field
									name='termMonths'
									label='Term (months)'
									required
									type='number'
									min={1}
									max={120}
									value={String(defaults.termMonths)} />
							</div>
							<section
								class='smx-world'
								aria-label='World ID verification'>
								<input
									type='hidden'
									name='worldIdProof' />
								<div class='smx-actions'>
									<button
										type='button'
										class='rc-button'
										data-world-id
										data-app-id={live ? worldId.appId : undefined}
										data-signal={state.wallet}
										data-action={worldId.action}>
										Verify with World ID
									</button>
									<span
										class='rc-pill'
										hidden
										data-world-id-verified>
										Verified
									</span>
								</div>
								<div
									data-world-id-qr
									hidden />
								<p data-world-id-status />
								{
									(worldId.simulated || DEMO_MODE) && (
										<div
											class='smx-actions'
											data-world-id-demo
											hidden>
											<button
												type='button'
												class='rc-button'
												data-world-id-sim='success'>
												Simulate success
											</button>
											<button
												type='button'
												class='rc-button'
												data-world-id-sim='sybil'>
												Simulate Sybil
											</button>
										</div>
									)
								}
							</section>
							<button
								type='submit'
								class='rc-button'
								data-variant='primary'
								data-size='lg'
								disabled
								data-dw-sparkle
								data-world-id-submit>
								Launch IPO
							</button>
							<FormError />
						</HxForm>
					</div>
				</SectionCard>
				<aside class='smx-page'>
					<NumberedStep
						number={1}
						title='Verify you are human'
						description='World ID proves one person, one IPO.' />
					<NumberedStep
						number={2}
						title='Stake and raise'
						description='Your stake backs the raise. Investors fund tranches held in escrow.' />
					<NumberedStep
						number={3}
						title='Prove income'
						description={
							`Share ${defaults.shareBps / 100}% of income with holders. `
							+ 'Miss a proof and the 0G agent freezes your escrow.'
						} />
					<Hint title='Minimum proven income'>
						{escapeText(`${defaults.minIncome} USDC per period.`)}
					</Hint>
				</aside>
			</div>
		</div>
	)
}
