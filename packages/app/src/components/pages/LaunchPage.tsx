/* eslint-disable @stylistic/max-len -- deeply nested JSX copy */
import { DEMO_MODE } from '../../consts.ts'
import type { LaunchState } from '../../types/index.ts'
import { escapeText } from '../../utils/escape.ts'
import { shortHex } from '../../utils/money.ts'
import { EmptyState } from '../EmptyState.tsx'
import { Field } from '../forms/Field.tsx'
import { FormError } from '../forms/FormError.tsx'
import { HxForm } from '../forms/HxForm.tsx'
import { Hint } from '../Hint.tsx'
import { NumberedStep } from '../NumberedStep.tsx'
import { PageHeader } from '../PageHeader.tsx'
import { SectionCard } from '../SectionCard.tsx'

/** Keep in step with `TRANCHE_PRESETS` in consts.ts. The first is the default. */
const TRANCHES = [
	{ value: '20-40-40', label: '3 tranches', split: '20 / 40 / 40' },
	{ value: '50-50', label: '2 tranches', split: '50 / 50' },
	{ value: '25-25-25-25', label: '4 tranches', split: '25 each' },
	{ value: '20-20-20-20-20', label: '5 tranches', split: '20 each' },
]

const CADENCES = [
	{ value: 'MONTHLY', label: 'Monthly', hint: 'Every 30 days' },
	{ value: 'QUARTERLY', label: 'Quarterly', hint: 'Every 90 days' },
]

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
				title='Launch your IPO'
				lede='Sell a share of your future income. Escrow releases in tranches as you prove it.'
				meta={
					<>
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
					context='Saved as your L-ISA on 0G Storage.'
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
									hint='3-6 letters, A-Z.' />
								<Field
									name='displayName'
									label='Display name'
									required
									maxlength={80}
									placeholder='Mushaheed' />
							</div>
							<Field
								name='headline'
								label='Headline (optional)'
								maxlength={280}
								placeholder='Software developer building open-source tools' />
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
									hint='Slashed if you default.' />
								<Field
									name='sharePct'
									label='Income share (%)'
									required
									type='number'
									min={0.01}
									max={50}
									step='any'
									value={String(defaults.shareBps / 100)}
									hint='Paid to holders. Max 50.' />
								<Field
									name='termMonths'
									label='Term (months)'
									required
									type='number'
									min={1}
									max={120}
									value={String(defaults.termMonths)} />
							</div>
							<fieldset class='smx-choices'>
								<legend>
									Escrow release
								</legend>
								<small>
									The first tranche releases at launch. Each approved income proof releases the next.
								</small>
								{
									TRANCHES.map((t, i) => (
										<label>
											<input
												type='radio'
												name='trancheSchedule'
												value={t.value}
												checked={i === 0} />
											{escapeText(t.label)}
											<small>
												{escapeText(t.split)}
											</small>
										</label>
									))
								}
							</fieldset>
							<fieldset class='smx-choices'>
								<legend>
									Income proof deadline
								</legend>
								<small>
									A missed deadline freezes escrow and starts a 14-day grace period.
								</small>
								{
									CADENCES.map((c, i) => (
										<label>
											<input
												type='radio'
												name='proofCadence'
												value={c.value}
												checked={i === 0} />
											{escapeText(c.label)}
											<small>
												{escapeText(c.hint)}
											</small>
										</label>
									))
								}
							</fieldset>
							<fieldset class='smx-choices'>
								<legend>
									Profile links (optional)
								</legend>
								<small>
									Shown on your token page.
								</small>
								<div class='smx-fields'>
									<Field
										name='social_x'
										label='X'
										type='url'
										maxlength={200}
										placeholder='https://x.com/yourhandle' />
									<Field
										name='social_github'
										label='GitHub'
										type='url'
										maxlength={200}
										placeholder='https://github.com/yourname' />
									<Field
										name='social_linkedin'
										label='LinkedIn'
										type='url'
										maxlength={200}
										placeholder='https://linkedin.com/in/yourname' />
									<Field
										name='social_website'
										label='Website'
										type='url'
										maxlength={300}
										placeholder='https://yoursite.com' />
								</div>
							</fieldset>
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
									!live && (worldId.simulated || DEMO_MODE) && (
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
						title='Verify with World ID'
						description='One IPO per person.' />
					<NumberedStep
						number={2}
						title='Stake and raise'
						description='Investors fund tranches held in escrow, backed by your stake.' />
					<NumberedStep
						number={3}
						title='Prove income'
						description={
							`Pay holders ${defaults.shareBps / 100}% of income. `
							+ 'A missed proof freezes escrow.'
						} />
					<Hint title='Minimum proven income'>
						{escapeText(`${defaults.minIncome} USDC per period.`)}
					</Hint>
				</aside>
			</div>
		</div>
	)
}
