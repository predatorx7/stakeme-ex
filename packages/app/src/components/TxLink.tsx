import { escapeText } from '../utils/escape.ts'
import { shortHex } from '../utils/money.ts'
import { isLocalRef, storageScanUrl } from '../utils/storage-ref.ts'
import { CopyButton } from './CopyButton.tsx'

/** A shortened hash with a Copy button. Pass `href` to link it. */
export function HashRef({ value, label, href }: {
	value: string
	/** Names the value for the Copy button, for example "terms hash". */
	label: string
	href?: string
}) {
	return (
		<span class='smx-ref'>
			{
				href
					? (
						<a
							href={href}
							target='_blank'
							rel='noopener noreferrer'
							title={value}>
							<code class='smx-mono'>
								{escapeText(shortHex(value, 8, 6))}
							</code>
						</a>
					)
					: (
						<code
							class='smx-mono'
							title={value}>
							{escapeText(shortHex(value, 8, 6))}
						</code>
					)
			}
			<CopyButton
				text={value}
				aria-label={`Copy ${label}`} />
		</span>
	)
}

/** Transaction hash linked to a Hedera testnet explorer. */
export function TxLink({ hash }: { hash: string }) {
	return (
		<HashRef
			value={hash}
			label='transaction hash'
			href={`https://hashscan.io/testnet/transaction/${hash}`} />
	)
}

/**
 * A 0G Storage ref. While the background upload is queued the ref is still
 * `local:<sha256>`: show "0G Storage: pending". The `STORAGE_CONFIRMED` event
 * reloads the live region, which then renders the root hash linked to
 * storagescan. A skipped or failed upload keeps the local hash.
 */
export function StorageRef({ value, status, label }: {
	value: string
	status?: string
	label: string
}) {
	if(status === 'PENDING') {
		return (
			<span
				class='smx-ref'
				data-storage-status='PENDING'
				title={value}>
				0G Storage: pending
			</span>
		)
	}

	return (
		<HashRef
			value={value}
			label={label}
			href={isLocalRef(value) ? undefined : storageScanUrl(value)} />
	)
}
