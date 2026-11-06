import { Dialog } from './dialog/index.ts'
import { CopyButton } from './CopyButton.tsx'

/**
 * Dialogs for the wallet hooks in `client/wallet.ts`, `client/hedera-pay.ts`
 * and `client/key-export.ts` (contract: docs/frontend-hooks.md). The client
 * hides options that don't apply, such as WalletConnect without a project id
 * or the browser extension without `window.ethereum`.
 */

/** Pasting a private key. Hidden until the "Import a key" option is chosen. */
function ImportKeyForm(props: { hook: string, placeholder: string }) {
	return (
		<form
			class='smx-key-import'
			hidden
			autocomplete='off'
			{...{ [props.hook]: '' }}>
			<label class='rc-field'>
				<span class='rc-field__label'>
					Private key
				</span>
				<input
					class='rc-input'
					type='password'
					name='key'
					autocomplete='off'
					spellcheck={false}
					placeholder={props.placeholder}
					required />
			</label>
			<button
				type='submit'
				class='rc-button'
				data-variant='primary'>
				Import key
			</button>
		</form>
	)
}

/** The wallet choice for sign-in: WalletConnect, generate, import. */
export function WalletConnectDialog() {
	return (
		<Dialog
			id='wallet-dialog'
			title='Connect a wallet'
			description='Choose how to sign in.'>
			<div class='smx-wallet-options'>
				<button
					type='button'
					class='rc-button'
					data-variant='primary'
					data-wallet-option='walletconnect'
					hidden>
					Connect with WalletConnect
				</button>
				<button
					type='button'
					class='rc-button'
					data-wallet-option='burner'>
					Generate a new wallet
				</button>
				<button
					type='button'
					class='rc-button'
					data-wallet-option='import'>
					Import a key
				</button>
				<ImportKeyForm
					hook='data-wallet-import'
					placeholder='0x… (64 hex characters)' />
				<button
					type='button'
					class='rc-button'
					data-wallet-option='injected'
					hidden>
					Browser extension
				</button>
				<p class='rc-field__hint'>
					WalletConnect shows a QR code and opens wallet apps on your phone. A
					generated or imported key lives only in this browser: export it to
					back it up.
				</p>
			</div>
		</Dialog>
	)
}

/** The Hedera payment signer choice, opened by `client/hedera-pay.ts`. */
export function HederaSignerDialog() {
	return (
		<Dialog
			id='hedera-signer-dialog'
			title='Sign the payment'
			description='Choose which Hedera account pays.'>
			<div class='smx-wallet-options'>
				<button
					type='button'
					class='rc-button'
					data-variant='primary'
					data-hedera-option='walletconnect'
					hidden>
					Connect with WalletConnect
				</button>
				<button
					type='button'
					class='rc-button'
					data-hedera-option='burner'>
					Generate a new key
				</button>
				<button
					type='button'
					class='rc-button'
					data-hedera-option='import'>
					Import a key
				</button>
				<ImportKeyForm
					hook='data-hedera-import'
					placeholder='ECDSA private key (hex)' />
				<button
					type='button'
					class='rc-button'
					data-key-export='hedera'
					hidden>
					Export key
				</button>
				<p class='rc-field__hint'>
					WalletConnect works with Hedera wallets such as HashPack. A
					generated or imported key lives only in this browser, and the
					account needs HBAR from the Hedera faucet.
				</p>
			</div>
		</Dialog>
	)
}

/** Shows a stored private key after an explicit reveal. */
export function KeyExportDialog() {
	return (
		<Dialog
			id='key-export-dialog'
			title='Export key'
			description='Anyone with this key controls the wallet.'>
			<div class='smx-wallet-options'>
				<p class='rc-field__hint'>
					Never share it. Clearing this browser's data deletes the key, so
					save a copy first.
				</p>
				<pre class='rc-code'>
					<code
						data-key-value
						hidden />
				</pre>
				<button
					type='button'
					class='rc-button'
					data-key-reveal>
					Reveal key
				</button>
				<CopyButton
					source='[data-key-value]'
					label='Copy key'
					aria-label='Copy private key'
					disabled />
			</div>
		</Dialog>
	)
}
