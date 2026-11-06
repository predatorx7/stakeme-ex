import { type CountdownStatus, countdownView } from '../../client/countdown.ts'
import { escapeText } from '../../utils/escape.ts'

/**
 * Proof-due pill. The initial text is rendered on the server; the client
 * module `countdown.ts` re-renders it from `data-due`. Renders nothing
 * without a due date (DEFAULTED and COMPLETED still show their label).
 */
export function ProofCountdown({ dueAt, status, graceEndsAt }: {
	/** `market.fundamentals.nextProofDueAt` */
	dueAt: string | null | undefined
	/** `market.status.kind` */
	status: CountdownStatus
	/** Defaults to `dueAt` + 14 days. */
	graceEndsAt?: string | null
}) {
	const terminal = status === 'DEFAULTED' || status === 'COMPLETED'
	if(!dueAt && !terminal) {
		return null
	}

	const view = countdownView({ dueAt: dueAt ?? 0, status, graceEndsAt })
	if(!view) {
		return null
	}

	return (
		<span
			class='proof-countdown'
			aria-live='off'
			data-tone={view.tone}
			data-proof-countdown={view.live ? '' : undefined}
			data-due={view.live ? dueAt : undefined}
			data-grace={view.live ? graceEndsAt || undefined : undefined}
			data-status={view.live ? status : undefined}>
			<time datetime={view.target || undefined}>
				{escapeText(view.text)}
			</time>
		</span>
	)
}
