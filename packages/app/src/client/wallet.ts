/// <reference lib="dom" />
import { showToast } from '@reclaimprotocol/design/behaviors'
import {
	type Chain,
	createWalletClient,
	custom,
	type EIP1193Provider,
	type Hex,
	http,
	type WalletClient,
} from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { createSiweMessage } from 'viem/siwe'
import { EVM_KEY_STORAGE } from './key-export.ts'
import { HEDERA_WALLET_FLAG, walletConnectConfig } from './walletconnect.ts'
import { pick, postJson, reloadOrRedirect, toastError } from './web3-util.ts'

/**
 * Wallet connect + SIWE sign-in (Better Auth). Delegated, no framework.
 *
 *   [data-wallet-connect]  click: open `#wallet-dialog` (or sign in directly
 *                          when the page has no dialog). Optional
 *                          `data-wallet-redirect="/path"`, `data-siwe-domain`.
 *   [data-wallet-option]   in the dialog: `walletconnect`, `burner` (generate),
 *                          `import`, `injected` (only with `window.ethereum`).
 *   [data-wallet-import]   form in the dialog: paste a private key.
 *   [data-wallet-burner]   click: sign in with the local wallet, no dialog.
 *   [data-wallet-signout]  click: end the session and every wallet link.
 *   [data-wallet-address]  text is filled with the short address.
 *   [data-wallet-kind]     text is filled with the wallet kind.
 *   [data-key-export="evm"] shown for a local wallet (see key-export.ts).
 *
 * Options: WalletConnect (lazy chunk, only with a project id), a local key
 * generated in this browser, an imported key, or an injected wallet.
 * Contract: docs/frontend-hooks.md.
 */

const ADDRESS_KEY = 'smx.walletAddress'
const KIND_KEY = 'smx.walletKind'
const LABEL_KEY = 'smx.walletLabel'
const SIWE_STATEMENT = 'Sign in to StakeMe Exchange.'
const DIALOG_ID = 'wallet-dialog'
const IMPORTED_KEY = 'smx.burnerImported'
const REPLACE_PROMPT =
	'Replace the wallet saved in this browser? Export it first to keep it.'

type WalletKind = 'injected' | 'walletconnect' | 'burner'

type Wallet = {
	address: `0x${string}`
	chainId: number
	sign: (message: string) => Promise<Hex>
	burner: boolean
	kind: WalletKind
	/** Shown in the header, for example "1inch Wallet" or "Local wallet". */
	label: string
	/**
	 * A viem client that signs and sends transactions as this wallet: locally
	 * for a local key, through the wallet for an injected or WalletConnect one.
	 */
	txClient: (chain: Chain, rpcUrl: string) => WalletClient
}

declare global {
	interface Window {
		/** Lets other modules reuse the connected wallet. */
		smxWallet?: {
			connect: (
				opts?: { burner?: boolean, kind?: WalletKind },
			) => Promise<Wallet>
			/** The signed-in address from this browser, if any. */
			address: () => `0x${string}` | undefined
			/** Reconnects the wallet used to sign in (for user-signed txs). */
			current: () => Promise<Wallet>
		}
	}
}

window.smxWallet = {
	connect: connectWallet,
	// Cast: the stored value is the address the SIWE sign-in verified.
	address: () => (readStorage(ADDRESS_KEY) ?? undefined) as Hex | undefined,
	current: currentWallet,
}

/** The button that opened the dialog: carries the redirect and domain. */
let pending: HTMLElement | undefined

document.addEventListener('click', (event) => {
	const target = event.target as Element | null
	const signOutButton = target?.closest<HTMLElement>('[data-wallet-signout]')
	if(signOutButton) {
		event.preventDefault()
		void signOut(signOutButton)
		return
	}

	const option = target?.closest<HTMLElement>('[data-wallet-option]')
	if(option && pending) {
		onOption(option.dataset.walletOption)
		return
	}

	const button = target?.closest<HTMLElement>(
		'[data-wallet-connect], [data-wallet-burner]',
	)
	if(!button || button.hasAttribute('disabled')) {
		return
	}

	event.preventDefault()
	if(button.hasAttribute('data-wallet-burner')) {
		void signIn(button, 'burner')
		return
	}

	const dialog = document.querySelector<HTMLDialogElement>(`#${DIALOG_ID}`)
	if(!dialog) {
		// No dialog markup: only a wallet the user already has, never a new key.
		if(injectedProvider()) {
			void signIn(button, 'injected')
		} else {
			toastError(new Error('No wallet found. Pick another option.'))
		}

		return
	}

	pending = button
	openDialog(dialog)
})

// Importing a pasted private key signs in with it as the local wallet.
document.addEventListener('submit', (event) => {
	const form = (event.target as Element | null)?.closest<HTMLFormElement>(
		'form[data-wallet-import]',
	)
	if(!form) {
		return
	}

	event.preventDefault()
	const origin = pending
	const input = form.elements.namedItem('key') as HTMLInputElement | null
	try {
		let key = input?.value.trim() ?? ''
		key = key.startsWith('0x') ? key : `0x${key}`
		// Throws for anything that is not a valid secp256k1 private key.
		privateKeyToAccount(key as Hex)
		const saved = readStorage(EVM_KEY_STORAGE)
		if(
			saved && saved !== key
			&& !confirm(REPLACE_PROMPT)
		) {
			return
		}

		writeStorage(EVM_KEY_STORAGE, key)
		writeStorage(IMPORTED_KEY, '1')
	} catch{
		toastError(new Error('Invalid private key. Check it and retry.'))
		return
	}

	if(input) {
		input.value = ''
	}

	closeDialog()
	if(origin) {
		void signIn(origin, 'burner')
	}
})

// `close` does not bubble: capture it. Esc or a backdrop click forgets the
// pending button; the import field never keeps a key.
document.addEventListener('close', (event) => {
	if((event.target as Element | null)?.id === DIALOG_ID) {
		pending = undefined
		resetDialog()
	}
}, true)

paintWallet()
// A nav swap brings a fresh header.
document.addEventListener('htmx:afterSettle', paintWallet)

/**
 * The injected EIP-1193 provider. Cast: other packages (Reown) declare
 * `window.ethereum` as a loose record, so it can't be retyped globally.
 */
function injectedProvider() {
	return window.ethereum as
		(EIP1193Provider & { isMetaMask?: boolean }) | undefined
}

function onOption(option: string | undefined) {
	const origin = pending
	if(!origin) {
		return
	}

	if(option === 'import') {
		const form = document.querySelector<HTMLFormElement>(
			`#${DIALOG_ID} form[data-wallet-import]`,
		)
		if(form) {
			form.hidden = false
			form.querySelector('input')?.focus()
		}

		return
	}

	if(
		option === 'walletconnect'
		|| option === 'burner'
		|| option === 'injected'
	) {
		closeDialog()
		void signIn(origin, option)
	}
}

function openDialog(dialog: HTMLDialogElement) {
	const set = (name: string, show: boolean, label?: string) => {
		const el = dialog.querySelector<HTMLElement>(
			`[data-wallet-option="${name}"]`,
		)
		if(el) {
			el.hidden = !show
			if(label) {
				el.textContent = label
			}
		}
	}

	set('walletconnect', !!walletConnectConfig())
	set('injected', !!injectedProvider())
	// A saved key is reused, never overwritten by "generate".
	set(
		'burner',
		true,
		readStorage(EVM_KEY_STORAGE)
			? 'Use the wallet saved in this browser'
			: 'Generate a new wallet',
	)
	dialog.showModal()
}

function closeDialog() {
	pending = undefined
	document.querySelector<HTMLDialogElement>(`#${DIALOG_ID}`)?.close()
}

function resetDialog() {
	const form = document.querySelector<HTMLFormElement>(
		`#${DIALOG_ID} form[data-wallet-import]`,
	)
	form?.reset()
	if(form) {
		form.hidden = true
	}
}

async function signIn(button: HTMLElement, kind: WalletKind) {
	button.setAttribute('aria-busy', 'true')
	try {
		const wallet = await connectWallet({ kind })
		const { json } = await postJson('/auth/siwe/nonce')
		const nonce = pick(json, 'nonce')
		if(typeof nonce !== 'string') {
			throw new Error('Sign-in failed. Try again.')
		}

		const message = createSiweMessage({
			address: wallet.address,
			chainId: wallet.chainId,
			domain: button.dataset.siweDomain || location.host,
			nonce,
			uri: location.origin,
			version: '1',
			statement: SIWE_STATEMENT,
		})
		if(wallet.kind === 'walletconnect') {
			showToast('Approve the sign-in in your wallet.')
		}

		const signature = await wallet.sign(message)
		await postJson('/auth/siwe/verify', { message, signature })
		writeStorage(ADDRESS_KEY, wallet.address)
		writeStorage(KIND_KEY, wallet.kind)
		writeStorage(LABEL_KEY, wallet.label)
		paintWallet()

		const redirect = button.dataset.walletRedirect
		if(redirect) {
			location.assign(redirect)
		} else {
			reloadOrRedirect()
		}
	} catch(err) {
		toastError(err)
	} finally {
		button.removeAttribute('aria-busy')
	}
}

/** Ends the Better Auth session, then every wallet link in this browser. */
async function signOut(button: HTMLElement) {
	button.setAttribute('aria-busy', 'true')
	try {
		await postJson('/auth/sign-out')
	} catch(err) {
		toastError(err)
	}

	try {
		const config = walletConnectConfig()
		if(config) {
			const tasks: Promise<unknown>[] = []
			// Only load the SDK chunks when a session can exist.
			if(readStorage(KIND_KEY) === 'walletconnect') {
				tasks.push(
					import('./walletconnect-evm.ts')
						.then((m) => m.disconnectEvm(config)),
				)
			}

			if(readStorage(HEDERA_WALLET_FLAG)) {
				tasks.push(
					import('./walletconnect-hedera.ts')
						.then((m) => m.disconnectHedera(config)),
				)
			}

			await Promise.allSettled(tasks)
		}
	} finally {
		// The local wallet key is kept on purpose: export or reuse it later.
		for(const key of [ADDRESS_KEY, KIND_KEY, LABEL_KEY, HEDERA_WALLET_FLAG]) {
			removeStorage(key)
		}

		location.assign('/')
	}
}

async function connectWallet(
	{ burner = false, kind }: { burner?: boolean, kind?: WalletKind } = {},
): Promise<Wallet> {
	// Never fall back to a local key: the caller must ask for it.
	const chosen = burner ? 'burner' : kind
	if(!chosen) {
		throw new Error('Pick a wallet first.')
	}

	if(chosen === 'walletconnect') {
		const config = walletConnectConfig()
		if(!config) {
			throw new Error('WalletConnect is unavailable. Pick another wallet.')
		}

		const { connectEvm } = await import('./walletconnect-evm.ts')
		const { provider, walletName } = await connectEvm(config)
		return fromProvider(provider, 'walletconnect', walletName)
	}

	if(chosen === 'injected') {
		const injected = injectedProvider()
		if(!injected) {
			throw new Error('No browser wallet found. Pick another option.')
		}

		return fromProvider(
			injected,
			'injected',
			injected.isMetaMask ? 'MetaMask' : 'Browser wallet',
		)
	}

	// Local key: generated once, or imported. Lives only in this browser.
	let key = readStorage(EVM_KEY_STORAGE) as Hex | null
	if(!key) {
		key = generatePrivateKey()
		writeStorage(EVM_KEY_STORAGE, key)
		removeStorage(IMPORTED_KEY)
	}

	const account = privateKeyToAccount(key)
	return {
		address: account.address,
		chainId: 1,
		burner: true,
		kind: 'burner',
		label: readStorage(IMPORTED_KEY) ? 'Imported key' : 'Local wallet',
		sign: (message) => account.signMessage({ message }),
		txClient: (chain, rpcUrl) => createWalletClient({
			account,
			chain,
			transport: http(rpcUrl),
		}),
	}
}

/**
 * Reconnects the wallet kind that signed in, and checks it is still the
 * signed-in account (the user may have switched accounts in the wallet).
 */
async function currentWallet() {
	const kind = readStorage(KIND_KEY) as WalletKind | null
	if(!kind) {
		throw new Error('Connect a wallet first.')
	}

	const wallet = await connectWallet({ kind })
	const signedIn = readStorage(ADDRESS_KEY)
	if(signedIn && signedIn.toLowerCase() !== wallet.address.toLowerCase()) {
		throw new Error(
			`Switch your wallet back to ${signedIn.slice(0, 6)}…`
			+ `${signedIn.slice(-4)}.`,
		)
	}

	return wallet
}

/** Wraps any EIP-1193 provider (injected or WalletConnect) with viem. */
async function fromProvider(
	provider: EIP1193Provider,
	kind: WalletKind,
	label: string,
): Promise<Wallet> {
	const client: WalletClient = createWalletClient({
		transport: custom(provider),
	})
	const [address] = await client.requestAddresses()
	if(!address) {
		throw new Error('No account selected. Choose one in your wallet.')
	}

	const chainId = await client.getChainId()
	return {
		address,
		chainId,
		burner: false,
		kind,
		label,
		sign: (message) => client.signMessage({ account: address, message }),
		txClient: (chain) => createWalletClient({
			account: address,
			chain,
			transport: custom(provider),
		}),
	}
}

function paintWallet() {
	const address = readStorage(ADDRESS_KEY)
	if(address) {
		const short = `${address.slice(0, 6)}…${address.slice(-4)}`
		const els = document.querySelectorAll<HTMLElement>('[data-wallet-address]')
		for(const el of els) {
			el.textContent ||= short
			el.title = address
		}
	}

	const label = readStorage(LABEL_KEY)
	if(label) {
		for(const el of document.querySelectorAll<HTMLElement>(
			'[data-wallet-kind]',
		)) {
			el.textContent = label
			el.hidden = false
		}
	}

	// Only a key held in this browser can be exported.
	const local = readStorage(KIND_KEY) === 'burner'
		&& !!readStorage(EVM_KEY_STORAGE)
	for(const el of document.querySelectorAll<HTMLElement>(
		'[data-key-export="evm"]',
	)) {
		el.hidden = !local
	}
}

// localStorage throws in sandboxed frames; the wallet then just reconnects.
function readStorage(key: string) {
	try {
		return localStorage.getItem(key)
	} catch{
		return null
	}
}

function writeStorage(key: string, value: string) {
	try {
		localStorage.setItem(key, value)
	} catch{}
}

function removeStorage(key: string) {
	try {
		localStorage.removeItem(key)
	} catch{}
}
