import { escapeText } from '../utils/escape.ts'
import type { BadgeTone } from '../utils/tones.ts'
import { Badge } from './Badge.tsx'

type JobStatus = 'QUEUED' | 'SENT' | 'CONFIRMED' | 'FAILED' | 'SIMULATED'

export const JOB_TONE: Record<JobStatus, BadgeTone> = {
	QUEUED: 'warn',
	SENT: 'warn',
	CONFIRMED: 'success',
	SIMULATED: 'info',
	FAILED: 'danger',
}

export const JOB_LABEL: Record<JobStatus, string> = {
	QUEUED: 'Pending',
	SENT: 'Pending',
	CONFIRMED: 'Confirmed',
	SIMULATED: 'Simulated',
	FAILED: 'Failed',
}

/**
 * Onchain call status. `data-chain-job` carries the job id so `client/live.ts`
 * can flip a pending badge when the `chain-job` SSE event arrives.
 */
export function ChainJobBadge({ id, status }: {
	id: string
	status: JobStatus
}) {
	return (
		<span
			data-chain-job={id}
			data-status={status}>
			<Badge tone={JOB_TONE[status]}>
				{escapeText(JOB_LABEL[status])}
			</Badge>
		</span>
	)
}

/** Creator-level "pending onchain" badge. Hidden until a job is pending. */
export function PendingChainBadge({ creatorId, pending }: {
	creatorId: string
	pending: number
}) {
	return (
		<span
			data-chain-pending={creatorId}
			data-count={pending}
			hidden={pending === 0}>
			<Badge
				tone='warn'
				title='Waiting for the onchain transaction'>
				<span data-chain-pending-label>
					{
						escapeText(
							pending > 1 ? `${pending} pending onchain` : 'Pending onchain',
						)
					}
				</span>
			</Badge>
		</span>
	)
}
