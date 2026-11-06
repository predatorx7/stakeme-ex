/// <reference lib="dom" />
import { UniversalConnector } from '@reown/appkit-universal-connector'
import type { EIP1193Provider } from 'viem'
import { CANCELLED, type WalletConnectConfig } from './walletconnect.ts'
import { pick } from './web3-util.ts'

/**
 * EVM sign-in over WalletConnect. Imported lazily by `wallet.ts` (its own
 * Vite chunk). Uses the WalletConnect App SDK that docs.walletconnect.com
 * recommends for a plain JavaScript app: `@reown/appkit-universal-connector`
 * (`UniversalConnector`: AppKit QR modal, mobile deep links, session
 * restore). `connectEvm` wraps it as the EIP-1193 provider viem expects.
 */

/** Hedera testnet EVM (Hashio), the default chain. */
export const HEDERA_TESTNET_CHAIN_ID = 296
export const HEDERA_TESTNET_RPC = 'https://testnet.hashio.io/api'
const CAIP_CHAIN = `eip155:${HEDERA_TESTNET_CHAIN_ID}`
const EXPLORER_API = 'https://explorer-api.walletconnect.com/v3/wallets'
const FEATURED_CACHE = 'smx.wc.featured.1inch'

const NETWORK = {
	id: HEDERA_TESTNET_CHAIN_ID,
	chainNamespace: 'eip155',
	caipNetworkId: CAIP_CHAIN,
	name: 'Hedera Testnet',
	nativeCurrency: { name: 'HBAR', symbol: 'HBAR', decimals: 18 },
	rpcUrls: { default: { http: [HEDERA_TESTNET_RPC] } },
} as const

let connector: Promise<UniversalConnector> | undefined

function init(config: WalletConnectConfig) {
	connector ||= (async() => {
		const featured = await oneInchWalletId(config.projectId)
		return UniversalConnector.init({
			projectId: config.projectId,
			metadata: config.metadata,
			networks: [{
				namespace: 'eip155',
				chains: [NETWORK],
				methods: ['personal_sign', 'eth_signTypedData_v4'],
				events: ['accountsChanged', 'chainChanged'],
			}],
			modalConfig: {
				// The preferred wallet shows first in the AppKit wallet list.
				featuredWalletIds: featured ? [featured] : [],
			},
			// Own storage prefix: the Hedera DAppConnector
			// (walletconnect-hedera.ts) throws on a stored session without a
			// `hedera` namespace, so the two must not share sessions.
			providerConfig: { customStoragePrefix: 'smx-evm' },
		})
	})()
	// A failed init must not stick: the next click retries.
	connector.catch(() => {
		connector = undefined
	})
	return connector
}

/**
 * Opens the pairing modal unless a session exists. Returns an EIP-1193
 * provider bound to the session, plus the wallet's own name.
 */
export async function connectEvm(config: WalletConnectConfig) {
	const wc = await init(config)
	if(!wc.provider.session) {
		await connectOrCancel(wc)
	}

	const session = wc.provider.session
	// "eip155:296:0xabc..." -> chain id and address.
	const [, chain, address] = session?.namespaces.eip155?.accounts[0]
		?.split(':') ?? []
	if(!session || !address) {
		throw new Error('The wallet did not share an account')
	}

	const chainId = Number(chain) || HEDERA_TESTNET_CHAIN_ID
	const provider: EIP1193Provider = {
		on() {},
		removeListener() {},
		// Account and chain answers come from the session; the rest goes to
		// the wallet.
		async request({ method, params }: { method: string, params?: unknown }) {
			switch (method) {
				case 'eth_accounts':
				case 'eth_requestAccounts':
					return [address]
				case 'eth_chainId':
					return `0x${chainId.toString(16)}`
				default:
					return wc.request(
						{ method, params: params as unknown[] },
						`eip155:${chainId}`,
					)
			}
		},
	// Cast: viem's `request` is a generic per-method function type that an
	// object literal cannot satisfy structurally.
	} as unknown as EIP1193Provider
	return {
		provider,
		/** The wallet's own name, such as "1inch Wallet". */
		walletName: session.peer.metadata.name || 'WalletConnect',
	}
}

type ModalState = { open: boolean }

/**
 * `UniversalConnector.connect()` never settles when the user closes the
 * modal: the pairing just hangs. Watch the modal state and reject with
 * `CANCELLED`, aborting the pairing so it can't connect later.
 */
function connectOrCancel(wc: UniversalConnector) {
	// Cast: `appKit` is private in the typings, but it is the only handle on
	// the modal state, and the documented class does not expose a close event.
	const { appKit } = wc as unknown as {
		appKit: { subscribeState: (cb: (state: ModalState) => void) => () => void }
	}
	return new Promise<void>((resolve, reject) => {
		let opened = false
		const stop = appKit.subscribeState(({ open }) => {
			if(open) {
				opened = true
			} else if(opened && !wc.provider.session) {
				// Closed without a session. (After a successful pairing the
				// session already exists when the modal closes.)
				stop()
				wc.provider.abortPairingAttempt()
				reject(new Error(CANCELLED))
			}
		})
		wc.connect().then(() => {
			stop()
			resolve()
		}, (err: unknown) => {
			stop()
			reject(err)
		})
	})
}

/** Ends the stored WalletConnect session, if any. Never throws. */
export async function disconnectEvm(config: WalletConnectConfig) {
	try {
		const wc = await init(config)
		if(wc.provider.session) {
			await wc.disconnect()
		}
	} catch{
		// Already gone or offline: the next connect starts a fresh session.
	}
}

/**
 * Looks up 1inch Wallet's WalletConnect id in the WalletConnect explorer
 * (https://docs.walletconnect.com/wallets/walletguide/explorer-api) so the
 * id isn't hard-coded. Cached for the tab; `undefined` when not found.
 */
async function oneInchWalletId(projectId: string) {
	try {
		const cached = sessionStorage.getItem(FEATURED_CACHE)
		if(cached) {
			return cached
		}
	} catch{}

	try {
		const url = new URL(EXPLORER_API)
		url.searchParams.set('projectId', projectId)
		url.searchParams.set('search', '1inch')
		url.searchParams.set('entries', '10')
		url.searchParams.set('page', '1')
		const res = await fetch(url, { signal: AbortSignal.timeout(3000) })
		const listings = pick(await res.json(), 'listings')
		if(!listings || typeof listings !== 'object') {
			return undefined
		}

		for(const [id, listing] of Object.entries(listings)) {
			const name = pick(listing, 'name')
			if(typeof name === 'string' && /^1inch/i.test(name)) {
				try {
					sessionStorage.setItem(FEATURED_CACHE, id)
				} catch{}

				return id
			}
		}
	} catch{
		// Offline or blocked: the list just isn't reordered.
	}

	return undefined
}
