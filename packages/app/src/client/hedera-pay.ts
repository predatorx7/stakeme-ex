/// <reference lib="dom" />
import type * as Hiero from '@hiero-ledger/sdk'
import { HEDERA_KEY_STORAGE } from './key-export.ts'
import { HEDERA_WALLET_FLAG, walletConnectConfig } from './walletconnect.ts'
import { pick, postJson, toastError } from './web3-util.ts'

/**
 * Hedera x402 dividend payment in the browser. Delegated, no framework.
 *
 *   button[data-hedera-pay="/dividends/{id}/payment-request"]
 *       data-hedera-settle="/dividends/{id}/payment"
 *   output[data-hedera-pay-status]   optional, inside the same container.
 *
 * Flow: POST payment-request -> sign ONE Hedera TransferTransaction that pays
 * every holder split -> POST the signed transaction as `paymentPayload`.
 * Signer, chosen in `#hedera-signer-dialog` (live mode only):
 *   - WalletConnect: the user's Hedera wallet (HashPack, Kabila, ...), when a
 *     project id is configured (meta `smx-walletconnect-project-id`).
 *   - A local ECDSA key in localStorage: generated here, or imported.
 *     `[data-key-export="hedera"]` in the dialog exports it (key-export.ts).
 * Without the dialog markup it uses WalletConnect when configured, else it
 * fails: a local key is only created when the user picks it. When the server
 * answers `mode: "simulated"` nothing is signed and the payload is
 * `{ simulated: true }`.
 *
 * Contract: docs/frontend-hooks.md.
 */

const KEY_STORAGE = HEDERA_KEY_STORAGE
const DIALOG_ID = 'hedera-signer-dialog'
const REPLACE_PROMPT =
	'Replace the key saved in this browser? Export it first to keep it.'
const ACCOUNT_STORAGE = 'smx.hedera.account'
/** Consensus node the transaction is frozen for (present on every network). */
const NODE_ACCOUNT = 3

type Requirement = {
	amount: string
	payTo: string
	extra?: { feePayer?: string }
}

type PaymentRequest = {
	x402Version: number
	mode: 'live' | 'simulated'
	network: string
	asset: string
	total: string
	accepts: Requirement[]
}

document.addEventListener('click', (event) => {
	const button = (event.target as Element | null)
		?.closest<HTMLButtonElement>('[data-hedera-pay]')
	if(!button || button.disabled) {
		return
	}

	event.preventDefault()
	button.disabled = true
	button.setAttribute('aria-busy', 'true')
	void pay(button)
		.catch((err) => {
			setStatus(button, err instanceof Error ? err.message : String(err))
			toastError(err)
		})
		.finally(() => {
			button.disabled = false
			button.removeAttribute('aria-busy')
		})
})

async function pay(button: HTMLButtonElement) {
	const requestUrl = button.dataset.hederaPay
	const settleUrl = button.dataset.hederaSettle
	if(!requestUrl || !settleUrl) {
		throw new Error('Missing data-hedera-pay or data-hedera-settle')
	}

	setStatus(button, 'Requesting payment terms...')
	const { json } = await postJson(requestUrl)
	const request = json as PaymentRequest
	if(!Array.isArray(request?.accepts) || !request.accepts.length) {
		throw new Error('No payment terms returned. Try again.')
	}

	let paymentPayload: Record<string, unknown>
	if(request.mode === 'simulated') {
		setStatus(button, 'Demo mode: simulating payment...')
		paymentPayload = { x402Version: request.x402Version, simulated: true }
	} else {
		const transaction = await signTransfer(button, request)
		if(!transaction) {
			setStatus(button, '')
			return
		}

		paymentPayload = {
			x402Version: request.x402Version,
			scheme: 'exact',
			network: request.network,
			accepted: request.accepts,
			payload: { transaction },
		}
	}

	setStatus(button, `Settling ${request.accepts.length} payments...`)
	const { json: paid } = await postJson(settleUrl, { paymentPayload })
	setStatus(button, 'Dividend paid.')
	button.dispatchEvent(
		new CustomEvent('smx:hedera-paid', { bubbles: true, detail: paid }),
	)
}

type HieroSdk = typeof Hiero

type Signer = 'walletconnect' | 'burner'

/**
 * Signs the multi-payee transfer with a Hedera wallet or the local key.
 * Returns `undefined` when the user closes the choice.
 */
async function signTransfer(button: HTMLElement, request: PaymentRequest) {
	const walletConnect = walletConnectConfig()
	const signer = await chooseSigner(!!walletConnect)
	if(!signer) {
		return undefined
	}

	// Loaded on demand: the Hiero SDK stays out of the main bundle.
	const sdk = await import('@hiero-ledger/sdk')
	if(signer === 'walletconnect' && walletConnect) {
		setStatus(button, 'Connecting your Hedera wallet...')
		const { connectHedera } = await import('./walletconnect-hedera.ts')
		const { signer: wallet, accountId } = await connectHedera(
			walletConnect,
			request.network,
		)
		try {
			localStorage.setItem(HEDERA_WALLET_FLAG, '1')
		} catch{}

		setStatus(button, `Approve the payment in your wallet (${accountId})...`)
		// Cast: the wallet-connect package is CJS-typed, so its `Transaction`
		// comes from the SDK's `require` typings, not the ESM ones used here.
		// At runtime both are the same bundled class.
		const tx = buildTransfer(sdk, request, accountId) as unknown as Parameters<
			typeof wallet.signTransaction
		>[0]
		const signed = await wallet.signTransaction(tx)
		return toBase64(signed.toBytes())
	}

	const key = burnerKey()
	const privateKey = sdk.PrivateKey.fromStringECDSA(key)
	const payer = await resolvePayerAccount(
		privateKey.publicKey.toEvmAddress(),
		request.network,
	)
	if(!payer) {
		const evm = `0x${privateKey.publicKey.toEvmAddress()}`
		throw new Error(
			`Account ${evm} has no HBAR. Fund it at `
			+ 'portal.hedera.com/faucet, then pay again.',
		)
	}

	setStatus(button, `Signing as ${payer}...`)
	const signed = await buildTransfer(sdk, request, payer).sign(privateKey)
	return toBase64(signed.toBytes())
}

/**
 * Asks which signer pays: WalletConnect, a generated local key, or an
 * imported one. Resolves `undefined` when the dialog closes without a choice
 * or the user goes to export the key. Without the dialog markup it uses
 * WalletConnect when configured, else fails: no key is created implicitly.
 */
function chooseSigner(walletConnect: boolean) {
	const dialog = document.querySelector<HTMLDialogElement>(`#${DIALOG_ID}`)
	if(!dialog) {
		// No dialog markup: never create a key on the user's behalf.
		return walletConnect
			? Promise.resolve<Signer>('walletconnect')
			: Promise.reject(new Error('No Hedera signer. Pick one and retry.'))
	}

	const show = (name: string, visible: boolean, label?: string) => {
		const el = dialog.querySelector<HTMLElement>(
			`[data-hedera-option="${name}"]`,
		)
		if(el) {
			el.hidden = !visible
			if(label) {
				el.textContent = label
			}
		}
	}

	const saved = hasStored(KEY_STORAGE)
	show('walletconnect', walletConnect)
	// A saved key is reused, never overwritten by "generate".
	show(
		'burner',
		true,
		saved ? 'Use the key saved in this browser' : 'Generate a new key',
	)
	const exportButton = dialog.querySelector<HTMLElement>(
		'[data-key-export="hedera"]',
	)
	if(exportButton) {
		exportButton.hidden = !saved
	}

	const form = dialog.querySelector<HTMLFormElement>(
		'form[data-hedera-import]',
	)
	if(form) {
		form.hidden = true
	}

	return new Promise<Signer | undefined>((resolve) => {
		const abort = new AbortController()
		const { signal } = abort
		const finish = (value: Signer | undefined) => {
			abort.abort()
			form?.reset()
			dialog.close()
			resolve(value)
		}

		dialog.addEventListener('click', (event) => {
			const target = event.target as Element | null
			const option = target?.closest<HTMLElement>('[data-hedera-option]')
			if(option) {
				const name = option.dataset.hederaOption
				if(name === 'import') {
					if(form) {
						form.hidden = false
						form.querySelector('input')?.focus()
					}
				} else if(name === 'walletconnect' || name === 'burner') {
					finish(name)
				}
			} else if(target?.closest('[data-key-export]')) {
				// key-export.ts closes this dialog and opens the export one.
				abort.abort()
				resolve(undefined)
			}
		}, { signal })
		form?.addEventListener('submit', (event) => {
			event.preventDefault()
			void importKey(form).then((ok) => {
				if(ok) {
					finish('burner')
				}
			})
		}, { signal })
		dialog.addEventListener('close', () => {
			abort.abort()
			resolve(undefined)
		}, { signal })
		dialog.showModal()
	})
}

/** Validates and stores a pasted ECDSA key. Shows a toast when invalid. */
async function importKey(form: HTMLFormElement) {
	const input = form.elements.namedItem('key') as HTMLInputElement | null
	const key = input?.value.trim() ?? ''
	try {
		const { PrivateKey } = await import('@hiero-ledger/sdk')
		// Throws for anything that is not an ECDSA private key (raw or DER hex).
		PrivateKey.fromStringECDSA(key)
		const saved = localStorage.getItem(KEY_STORAGE)
		if(
			saved && saved !== key
			&& !confirm(REPLACE_PROMPT)
		) {
			return false
		}

		localStorage.setItem(KEY_STORAGE, key)
		// The cached account belonged to the previous key.
		localStorage.removeItem(ACCOUNT_STORAGE)
		return true
	} catch{
		toastError(new Error('Invalid ECDSA key. Check it and retry.'))
		return false
	}
}

function hasStored(key: string) {
	try {
		return !!localStorage.getItem(key)
	} catch{
		return false
	}
}

/** Builds the frozen transfer: `payer` pays every holder, the operator fees. */
function buildTransfer(
	{ AccountId, Hbar, TransactionId, TransferTransaction }: HieroSdk,
	request: PaymentRequest,
	payer: string,
) {
	const feePayer = request.accepts[0].extra?.feePayer
	if(!feePayer) {
		throw new Error('No fee payer in payment terms. Try again.')
	}

	const tx = new TransferTransaction()
		.setTransactionId(TransactionId.generate(AccountId.fromString(feePayer)))
		.setNodeAccountIds([new AccountId(NODE_ACCOUNT)])
		.setMaxTransactionFee(new Hbar(2))
	const payerId = AccountId.fromString(payer)
	const hbar = request.asset === '0.0.0'
	for(const r of request.accepts) {
		const to = AccountId.fromString(r.payTo)
		if(hbar) {
			tx.addHbarTransfer(to, Hbar.fromTinybars(r.amount))
		} else {
			tx.addTokenTransfer(request.asset, to, Number(r.amount))
		}
	}

	if(hbar) {
		tx.addHbarTransfer(payerId, Hbar.fromTinybars(`-${request.total}`))
	} else {
		tx.addTokenTransfer(request.asset, payerId, -Number(request.total))
	}

	return tx.freeze()
}

/** Local ECDSA key (hex), generated on first use unless one was imported. */
function burnerKey() {
	try {
		const existing = localStorage.getItem(KEY_STORAGE)
		if(existing) {
			return existing
		}
	} catch{}

	const bytes = crypto.getRandomValues(new Uint8Array(32))
	const key = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
	try {
		localStorage.setItem(KEY_STORAGE, key)
	} catch{}

	return key
}

/** Burner account id: cached, else found by EVM alias on the mirror node. */
async function resolvePayerAccount(evmAddress: string, network: string) {
	try {
		const cached = localStorage.getItem(ACCOUNT_STORAGE)
		if(cached) {
			return cached
		}
	} catch{}

	const net = network.endsWith('mainnet') ? 'mainnet' : 'testnet'
	const res = await fetch(
		`https://${net}.mirrornode.hedera.com/api/v1/accounts/0x${evmAddress}`,
	)
	if(!res.ok) {
		return undefined
	}

	const account = pick(await res.json(), 'account')
	if(typeof account !== 'string') {
		return undefined
	}

	try {
		localStorage.setItem(ACCOUNT_STORAGE, account)
	} catch{}

	return account
}

function toBase64(bytes: Uint8Array) {
	let binary = ''
	for(const b of bytes) {
		binary += String.fromCharCode(b)
	}

	return btoa(binary)
}

function setStatus(from: HTMLElement, text: string) {
	const scope = from.closest('[data-hedera-pay-scope]') || document
	const out = scope.querySelector<HTMLElement>('[data-hedera-pay-status]')
	if(out) {
		out.textContent = text
	}
}
