import type { IncomeProof } from '../types/index.ts'
import { escapeText } from '../utils/escape.ts'
import { shortHex } from '../utils/money.ts'
import { CopyButton } from './CopyButton.tsx'
import { StorageRef } from './TxLink.tsx'

const ROUTING_TIP = 'Routed to a TEE provider by 0G; no attestation returned'

/**
 * Who audited an income proof, so the 0G step is never silent: the 0G
 * Private Computer model, request id and provider address (short, with
 * copy), the auditor's one-line reasoning, the TEE status and the 0G
 * Storage log; a plain label for the offline rules-engine fallback; and
 * "0G audit unavailable, retry" while 0G could not audit the proof.
 */
export function ProofAudit({ proof: p }: { proof: IncomeProof }) {
	const via0g = p.engine === '0g-router' || p.engine === '0g-compute'
		|| (!p.engine && !!p.model && p.model !== 'rules-engine')
	let head
	if(p.auditStatus === 'AUDIT_UNAVAILABLE') {
		head = (
			<span title={p.auditMessage}>
				0G audit unavailable, retry
			</span>
		)
	} else if(via0g) {
		head = (
			<span title={p.reasoning ?? p.rejectReason}>
				Audited by 0G Private Computer
			</span>
		)
	} else if(p.model) {
		head = (
			<span title={p.reasoning ?? p.rejectReason}>
				Fallback: rules engine (0G unavailable)
			</span>
		)
	} else {
		head = (
			<span>
				Pending
			</span>
		)
	}

	return (
		<>
			{head}
			{
				via0g && !!p.model && (
					<>
						{' '}
						<code
							class='smx-mono'
							title='Model'>
							{escapeText(p.model)}
						</code>
					</>
				)
			}
			{
				!!p.requestId && (
					<>
						{' '}
						<span class='smx-ref'>
							<code
								class='smx-mono'
								title={p.requestId}>
								{escapeText(`req ${shortHex(p.requestId, 13, 5)}`)}
							</code>
							<CopyButton
								text={p.requestId}
								aria-label='Copy 0G request id' />
						</span>
					</>
				)
			}
			{
				via0g && !!p.providerAddress && (
					<>
						{' '}
						<span class='smx-ref'>
							<code
								class='smx-mono'
								title={`Provider ${p.providerAddress}`}>
								{escapeText(`provider ${shortHex(p.providerAddress, 6, 4)}`)}
							</code>
							<CopyButton
								text={p.providerAddress}
								aria-label='Copy 0G provider address' />
						</span>
					</>
				)
			}
			{
				p.teeVerified === true && (
					<>
						{' '}
						<span
							class='rc-pill'
							data-tone='verified'>
							TEE verified
						</span>
					</>
				)
			}
			{
				via0g && p.teeVerified !== true && p.trustMode === 'private' && (
					<>
						{' '}
						<span
							class='rc-pill'
							data-tone='sandbox'
							title={ROUTING_TIP}>
							Private routing (TEE provider)
						</span>
					</>
				)
			}
			{
				!!p.auditLogRef && (
					<>
						{' '}
						<StorageRef
							value={p.auditLogRef}
							status={p.auditLogStorage}
							label='0G Storage log ref' />
					</>
				)
			}
			{
				via0g && !!p.reasoning && (
					<div
						class='smx-mono'
						title={p.reasoning}>
						{escapeText(`Auditor: ${oneLine(p.reasoning)}`)}
					</div>
				)
			}
		</>
	)
}

/** The auditor's reasoning as a single line, cut at 160 characters. */
function oneLine(text: string) {
	const line = text.replace(/\s+/g, ' ').trim()
	return line.length > 160 ? `${line.slice(0, 159)}…` : line
}
