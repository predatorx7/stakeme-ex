import { Badge } from '../Badge.tsx'
import { ExpandableCard } from '../ExpandableCard.tsx'
import { Field } from '../forms/Field.tsx'

/**
 * Suggestion-only terms calculator for the launch form. Rendered OUTSIDE
 * `#launch-form` so its inputs never submit. `client/terms-calculator.ts` reads
 * `[data-terms-calc]`, renders into `[data-calc-result]` and fills the form
 * fields on "Use these terms". Formulas live in `utils/terms-suggest.ts`.
 */
export function TermsCalculator({ minIncome }: { minIncome: string }) {
	return (
		<div
			data-terms-calc
			data-min-income={minIncome}>
			<ExpandableCard
				id='terms-calculator'
				title='Suggest terms from your income'
				context='Suggestion only. You decide.'
				trail={
					<Badge tone='info'>
						Optional
					</Badge>
				}>
				<div class='smx-form'>
					<div class='smx-fields'>
						<Field
							name='calc-income'
							label='Monthly income (USD)'
							type='number'
							min={0}
							step='any'
							placeholder='5000' />
						<Field
							name='calc-goal'
							label='Amount to raise (USDC)'
							type='number'
							min={0}
							step='any'
							placeholder='20000' />
						<Field
							name='calc-term'
							label='Term (months)'
							type='number'
							min={1}
							max={120}
							step={1}
							value='24' />
						<Field
							name='calc-growth'
							label='Yearly income growth (%)'
							type='number'
							step='any'
							value='0' />
						<Field
							name='calc-savings'
							label='Savings (USD, optional)'
							type='number'
							min={0}
							step='any'
							hint='Your stake stays under half of this.' />
					</div>
					<label class='smx-calc-check'>
						<input
							type='checkbox'
							data-calc-varies />
						My income changes a lot from month to month
					</label>
					<p
						class='smx-calc-empty'
						data-calc-empty>
						Enter your income and goal to see suggested terms.
					</p>
					<div
						class='smx-calc-result'
						data-calc-result
						aria-live='polite'
						hidden>
						<dl data-calc-list />
						<ul
							class='smx-calc-warnings'
							data-calc-warnings />
						<button
							type='button'
							class='rc-button'
							data-variant='primary'
							data-calc-apply>
							Use these terms
						</button>
						<small class='rc-field__hint'>
							This fills the form below. You can still edit every field.
						</small>
					</div>
				</div>
			</ExpandableCard>
		</div>
	)
}
