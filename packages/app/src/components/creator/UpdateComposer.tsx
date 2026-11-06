import { escapeText } from '../../utils/escape.ts'
import { Field } from '../forms/Field.tsx'
import { FormError } from '../forms/FormError.tsx'
import { HxForm } from '../forms/HxForm.tsx'
import { SectionCard } from '../SectionCard.tsx'

/** Keep in step with the limit in `post_creator_update` (sql/ddl.sql). */
const DAILY_LIMIT = 5

/**
 * The hub's "Post an update" card. `updatesLeft` is the hub document's
 * remaining allowance. The server enforces ownership and the limit; this form
 * only reflects them.
 */
export function UpdateComposer({ ticker, updatesLeft = DAILY_LIMIT }: {
	ticker: string
	updatesLeft?: number
}) {
	const spent = updatesLeft <= 0
	return (
		<SectionCard
			id='post-update'
			title='Post an update'
			context='Holders see it on your token page and in the live feed.'
			plain>
			<div class='smx-body'>
				<HxForm
					action={`/creators/${ticker}/updates`}
					ext='json-enc'
					class='smx-form'>
					<Field
						name='body'
						label='Update'
						type='textarea'
						rows={4}
						required
						maxlength={1000}
						placeholder='What changed since your last update?'
						hint='Plain text, up to 1,000 characters.' />
					<Field
						name='link'
						label='Link (optional)'
						type='url'
						maxlength={300}
						pattern='https://\S+'
						placeholder='https://'
						hint='Must start with https://.' />
					<div class='smx-actions'>
						<button
							type='submit'
							class='rc-button'
							data-variant='primary'
							disabled={spent}>
							Post update
						</button>
						<small class='rc-field__hint'>
							{escapeText(allowance(updatesLeft))}
						</small>
					</div>
					<FormError />
				</HxForm>
			</div>
		</SectionCard>
	)
}

function allowance(left: number) {
	return left <= 0
		? `You've posted ${DAILY_LIMIT} updates in the last 24 hours. `
			+ 'Try again later.'
		: `${left} of ${DAILY_LIMIT} posts left in the next 24 hours.`
}
