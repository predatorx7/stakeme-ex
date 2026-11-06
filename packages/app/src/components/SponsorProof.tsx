import { HEDERA_NETWORK } from '../consts.ts'
import type { Creator, IncomeProof } from '../types/index.ts'
import { escapeText } from '../utils/escape.ts'
import { shortHex } from '../utils/money.ts'
import { CopyButton } from './CopyButton.tsx'
import { HashRef, StorageRef, TxLink } from './TxLink.tsx'

/**
 * "Verified on" card: shows the presenter (and judges) that World ID, Hedera
 * and 0G were really used. Rows with no data are hidden. Always on.
 */
export function SponsorProof({ creator, proofs }: {
	creator: Creator
	proofs?: IncomeProof[]
}) {
	const c = creator
	// Newest first; the first audit with a Router request id.
	const audit = (proofs ?? []).find((p) => p.requestId)
	const storageProof = (proofs ?? []).find((p) => p.auditLogRef)
	const scan = (kind: string, addr: string) => {
		return `https://hashscan.io/${HEDERA_NETWORK}/${kind}/${addr}`
	}

	const contracts = [
		['Escrow ISA', c.contractAddress],
		['Share token', c.tokenAddress],
		['Pool', c.poolAddress],
		['ATS token', c.atsTokenAddress],
	].filter((x): x is [string, string] => !!x[1])
	const lastTx = c.chain?.lastTxHash

	return (
		<section
			class='smx-proof'
			aria-label='Verified on'>
			<h3 class='smx-proof__title'>
				Verified on
			</h3>
			{
				!!c.worldIdNullifier && (
					<div class='smx-proof__row'>
						<span class='smx-proof__name'>
							World ID
						</span>
						<span class='smx-proof__body'>
							Unique human verified (World ID v4)
							<span class='smx-ref'>
								<code
									class='smx-mono'
									title={c.worldIdNullifier}>
									{escapeText(shortHex(c.worldIdNullifier, 8, 6))}
								</code>
								<CopyButton
									text={c.worldIdNullifier}
									aria-label='Copy World ID nullifier' />
							</span>
						</span>
					</div>
				)
			}
			<div class='smx-proof__row'>
				<span class='smx-proof__name'>
					Hedera
				</span>
				<span class='smx-proof__body'>
					{
						contracts.length
							? (
								<>
									{
										contracts.map(([label, addr]) => (
											<a
												class='smx-proof__chip'
												href={scan('contract', addr)}
												target='_blank'
												rel='noopener noreferrer'
												title={addr}>
												{escapeText(label)}
											</a>
										))
									}
									{
										!!lastTx && (
											<span class='smx-proof__tx'>
												Latest tx
												{' '}
												<TxLink hash={lastTx} />
											</span>
										)
									}
								</>
							)
							: (
								<span class='smx-proof__muted'>
									Off-chain demo creator
								</span>
							)
					}
				</span>
			</div>
			{
				!!(audit || storageProof) && (
					<div class='smx-proof__row'>
						<span class='smx-proof__name'>
							0G
						</span>
						<span class='smx-proof__body'>
							{
								!!audit?.requestId && (
									<span class='smx-proof__tx'>
										Router request
										<HashRef
											value={audit.requestId}
											label='0G Router request ID' />
									</span>
								)
							}
							{
								!!storageProof?.auditLogRef && (
									<span class='smx-proof__tx'>
										Storage root
										<StorageRef
											value={storageProof.auditLogRef}
											status={storageProof.auditLogStorage}
											label='0G Storage root' />
									</span>
								)
							}
							{
								audit?.engine === '0g-router' && (
									<span class='smx-proof__muted'>
										Audited privately on 0G Private Computer
									</span>
								)
							}
						</span>
					</div>
				)
			}
		</section>
	)
}
