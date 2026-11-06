import { escapeText } from '../utils/escape.ts'
import { shortHex } from '../utils/money.ts'
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
