import type { IncomeProof, Tranche } from '../../types/index.ts'
import { escapeText } from '../../utils/escape.ts'
import { formatUsdc } from '../../utils/money.ts'
import { HashRef, TxLink } from '../TxLink.tsx'

type StepState = 'idle' | 'active' | 'done' | 'denied'

/**
 * The tranche a proof unlocks: the one at the proof's period, else the first
 * locked one, else the last released. Pass the result as `nextTranche`.
 */
export function pickTranche(
	tranches: Tranche[],
	proof?: IncomeProof | null,
) {
	return tranches.find((t) => t.idx === proof?.period)
		?? tranches.find((t) => t.status === 'LOCKED')
		?? tranches.findLast((t) => t.status === 'RELEASED')
}

/**
 * Three-step header for the proof flow: bank proof verified, audit approved,
 * tranche released. The server renders the state of `latestProof`; the client
 * (`client/proof-moment.ts`) animates it when `PROOF_VERIFIED`,
 * `PROOF_REJECTED` or `TRANCHE_RELEASED` arrives for `ticker` over SSE.
 * Sits above `ProofAudit`, which keeps the audit detail (model, provider,
 * TEE, storage log, reasoning).
 */
export function ProofPipeline({
	ticker,
	latestProof: p,
	nextTranche: t,
	singleTranche,
}: {
	ticker: string
	latestProof?: IncomeProof | null
	nextTranche?: Tranche | null
	/** One tranche, already released at raise close: step 3 has nothing to do. */
	singleTranche?: boolean
}) {
	const released = t?.status === 'RELEASED'
	const steps: [StepState, StepState, StepState] = ['idle', 'idle', 'idle']
	if(p?.status === 'PENDING') {
		steps[0] = 'done'
		steps[1] = 'active'
	} else if(p?.status === 'APPROVED') {
		steps[0] = 'done'
		steps[1] = 'done'
		steps[2] = singleTranche ? 'idle' : released ? 'done' : 'active'
	} else if(p?.status === 'REJECTED') {
		steps[0] = 'done'
		steps[1] = 'denied'
	}

	const reason = p?.status === 'REJECTED' ? p.rejectReason ?? '' : ''
	const amount = singleTranche ? '' : t?.amount ?? ''
	return (
		<section
			class='smx-pp'
			data-proof-pipeline
			data-ticker={ticker}
			data-amount={amount}
			aria-label='Proof pipeline'>
			<ol class='smx-pp__steps'>
				<li
					class='smx-pp__step'
					data-step='1'
					data-state={steps[0]}>
					<Check />
					<span class='smx-pp__text'>
						<strong>
							Bank proof verified
						</strong>
						<small title='Reclaim'>
							zkTLS bank proof
						</small>
					</span>
				</li>
				<li
					class='smx-pp__step'
					data-step='2'
					data-state={steps[1]}>
					<Check />
					<span class='smx-pp__text'>
						<strong data-pp-ok>
							Audit approved
						</strong>
						<strong data-pp-denied>
							Audit denied
						</strong>
						<small title='0G Private Computer'>
							Private compute
						</small>
						<small
							class='smx-pp__reason'
							data-pp-reason>
							{escapeText(reason)}
						</small>
						{
							!!p?.requestId && (
								<HashRef
									value={p.requestId}
									label='0G request id' />
							)
						}
					</span>
				</li>
				<li
					class='smx-pp__step'
					data-step='3'
					data-state={steps[2]}>
					<Check />
					<span class='smx-pp__text'>
						<strong>
							{singleTranche ? 'No tranche to release' : 'Tranche released'}
						</strong>
						<small title='Hedera'>
							{singleTranche ? 'Paid at raise close' : 'Escrow payout'}
						</small>
						{!!released && !!t?.txHash && <TxLink hash={t.txHash} />}
					</span>
				</li>
			</ol>
			{
				!!amount && (
					<p class='smx-pp__amount'>
						<span data-pp-label>
							{released ? 'Released' : 'Next tranche'}
						</span>
						{' '}
						<span class='smx-num'>
							<span
								class='smx-pp__sr'
								data-pp-sr>
								{escapeText(formatUsdc(amount))}
							</span>
							<span
								aria-hidden='true'
								data-pp-amount>
								{escapeText(formatUsdc(amount))}
							</span>
						</span>
					</p>
				)
			}
		</section>
	)
}

/** The check is drawn with stroke-dashoffset, which the `Icon` set can't do. */
function Check() {
	return (
		<svg
			class='smx-pp__mark'
			viewBox='0 0 20 20'
			aria-hidden='true'
			focusable='false'>
			<circle
				class='smx-pp__ring'
				cx='10'
				cy='10'
				r='8.5' />
			<path
				class='smx-pp__tick'
				pathLength='1'
				d='M5.5 10.5l3 3 6-6.5' />
			<path
				class='smx-pp__cross'
				pathLength='1'
				d='M7 7l6 6M13 7l-6 6' />
		</svg>
	)
}
