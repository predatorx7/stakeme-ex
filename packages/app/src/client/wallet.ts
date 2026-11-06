/// <reference lib="dom" />
import {
	createWalletClient,
	custom,
	type EIP1193Provider,
	type Hex,
	type WalletClient,
} from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { createSiweMessage } from 'viem/siwe'
import { pick, postJson, reloadOrRedirect, toastError } from './web3-util.ts'

/**
 * Wallet connect + SIWE sign-in (Better Auth). Delegated, no framework.
 *
 *   [data-wallet-connect]  click: connect, sign in, reload. Optional
 *                          `data-wallet-redirect="/path"`, `data-siwe-domain`.
 *   [data-wallet-burner]   click: force the demo burner wallet.
 *   [data-wallet-address]  text is filled with the short address.
 *
 * With no `window.ethereum`, a demo burner key kept in localStorage signs.
 * Contract: docs/frontend-hooks.md.
 */

const BURNER_KEY = 'smx.burnerKey'
const ADDRESS_KEY = 'smx.walletAddress'
const SIWE_STATEMENT = 'Sign in to StakeMe Exchange.'

type Wallet = {
	address: `0x${string}`
	chainId: number
	sign: (message: string) => Promise<Hex>
	burner: boolean
}

declare global {
	interface Window {
		ethereum?: EIP1193Provider
		/** Lets other modules reuse the connected wallet. */
		smxWallet?: { connect: (opts?: { burner?: boolean }) => Promise<Wallet> }
	}
}

window.smxWallet = { connect: connectWallet }

document.addEventListener('click', (event) => {
	const target = event.target as Element | null
	const button = target?.closest<HTMLElement>(
		'[data-wallet-connect], [data-wallet-burner]',
	)
	if(!button || button.hasAttribute('disabled')) {
		return
	}

	event.preventDefault()
	void signIn(button, button.hasAttribute('data-wallet-burner'))
})

paintAddress(readStorage(ADDRESS_KEY))

async function signIn(button: HTMLElement, forceBurner: boolean) {
	button.setAttribute('aria-busy', 'true')
	try {
		const wallet = await connectWallet({ burner: forceBurner })
		const { json } = await postJson('/auth/siwe/nonce')
		const nonce = pick(json, 'nonce')
		if(typeof nonce !== 'string') {
			throw new Error('Sign-in failed: no nonce')
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
		const signature = await wallet.sign(message)
		await postJson('/auth/siwe/verify', { message, signature })
		writeStorage(ADDRESS_KEY, wallet.address)
		paintAddress(wallet.address)

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

async function connectWallet(
	{ burner = false }: { burner?: boolean } = {},
): Promise<Wallet> {
	const provider = window.ethereum
	if(provider && !burner) {
		const client: WalletClient = createWalletClient({
			transport: custom(provider),
		})
		const [address] = await client.requestAddresses()
		if(!address) {
			throw new Error('No account selected')
		}

		const chainId = await client.getChainId()
		return {
			address,
			chainId,
			burner: false,
			sign: (message) => client.signMessage({ account: address, message }),
		}
	}

	// Demo path: a throwaway key so judges can try SMX without MetaMask.
	let key = readStorage(BURNER_KEY) as Hex | null
	if(!key) {
		key = generatePrivateKey()
		writeStorage(BURNER_KEY, key)
	}

	const account = privateKeyToAccount(key)
	return {
		address: account.address,
		chainId: 1,
		burner: true,
		sign: (message) => account.signMessage({ message }),
	}
}

function paintAddress(address: string | null) {
	if(!address) {
		return
	}

	const short = `${address.slice(0, 6)}…${address.slice(-4)}`
	const els = document.querySelectorAll<HTMLElement>('[data-wallet-address]')
	for(const el of els) {
		el.textContent ||= short
		el.title = address
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
