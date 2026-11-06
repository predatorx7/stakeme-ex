/// <reference lib="dom" />
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
 * Signer: a burner ECDSA key in localStorage (DEMO). When the server
 * answers `mode: "simulated"` nothing is signed and the payload is
 * `{ simulated: true }`.
 *
 * Contract: docs/frontend-hooks.md.
 */

const KEY_STORAGE = 'smx.hedera.burner'
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
		throw new Error('The server returned no payment requirements')
	}

	let paymentPayload: Record<string, unknown>
	if(request.mode === 'simulated') {
		setStatus(button, 'Demo mode: simulating the Hedera payment...')
		paymentPayload = { x402Version: request.x402Version, simulated: true }
	} else {
		const transaction = await signTransfer(button, request)
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

/** Builds, freezes and signs the multi-payee transfer. Returns base64 bytes. */
async function signTransfer(button: HTMLElement, request: PaymentRequest) {
	// Loaded on demand: the Hiero SDK stays out of the main bundle.
	const {
		AccountId, Hbar, PrivateKey, TransactionId, TransferTransaction,
	} = await import('@hiero-ledger/sdk')

	const key = burnerKey()
	const privateKey = PrivateKey.fromStringECDSA(key)
	const payer = await resolvePayerAccount(
		privateKey.publicKey.toEvmAddress(),
		request.network,
	)
	if(!payer) {
		const evm = `0x${privateKey.publicKey.toEvmAddress()}`
		throw new Error(
			`Fund the demo wallet ${evm} from the Hedera faucet `
			+ '(portal.hedera.com/faucet), then pay again.',
		)
	}

	const feePayer = request.accepts[0].extra?.feePayer
	if(!feePayer) {
		throw new Error('Payment request has no fee payer')
	}

	setStatus(button, `Signing as ${payer}...`)
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

	const signed = await tx.freeze().sign(privateKey)
	return toBase64(signed.toBytes())
}

/** Burner ECDSA key (hex), created on first use. DEMO only. */
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
