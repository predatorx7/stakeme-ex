/// <reference lib="dom" />
// Deep imports: the package root also pulls in AppKit, ethers and walletkit.
import {
	DAppConnector
} from '@hashgraph/hedera-wallet-connect/dist/lib/dapp/index.js'
import {
	HederaChainId,
	HederaSessionEvent,
} from '@hashgraph/hedera-wallet-connect/dist/lib/shared/index.js'
import { LedgerId } from '@hiero-ledger/sdk'
import { CANCELLED, type WalletConnectConfig } from './walletconnect.ts'

/**
 * Hedera native signing over WalletConnect (`hedera:` namespace), for
 * HashPack, Kabila and other Hedera wallets. Imported lazily by
 * `hedera-pay.ts` (its own Vite chunk, next to the Hiero SDK).
 *
 * `DAppConnector` stores its sessions under the default WalletConnect storage
 * prefix; the EVM sign-in uses another one (`walletconnect-evm.ts`).
 */

let connector: Promise<DAppConnector> | undefined

function init(config: WalletConnectConfig, network: string) {
	const mainnet = network.endsWith('mainnet')
	connector ||= (async() => {
		const instance = new DAppConnector(
			config.metadata,
			mainnet ? LedgerId.MAINNET : LedgerId.TESTNET,
			config.projectId,
			undefined,
			[HederaSessionEvent.ChainChanged, HederaSessionEvent.AccountsChanged],
			[mainnet ? HederaChainId.Mainnet : HederaChainId.Testnet],
		)
		await instance.init({ logger: 'error' })
		return instance
	})()
	// A failed init must not stick: the next click retries.
	connector.catch(() => {
		connector = undefined
	})
	return connector
}

/**
 * Returns the signer of the connected Hedera account. Opens the pairing
 * modal (QR and wallet list) unless a session already exists.
 */
export async function connectHedera(
	config: WalletConnectConfig,
	network: string,
) {
	const dapp = await init(config, network)
	if(!dapp.signers.length) {
		try {
			// `true`: reject when the user closes the modal.
			await dapp.openModal(undefined, true)
		} catch(err) {
			throw new Error(
				err instanceof Error && /reject/i.test(err.message)
					? CANCELLED
					: err instanceof Error ? err.message : String(err),
			)
		}
	}

	const signer = dapp.signers[0]
	if(!signer) {
		throw new Error('No Hedera account selected')
	}

	return { signer, accountId: signer.getAccountId().toString() }
}

/** Ends every Hedera WalletConnect session. Never throws. */
export async function disconnectHedera(
	config: WalletConnectConfig,
	network = 'hedera:testnet',
) {
	try {
		const dapp = await init(config, network)
		await dapp.disconnectAll()
	} catch{
		// No session to end.
	}
}
