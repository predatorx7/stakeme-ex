/// <reference lib="dom" />

/**
 * WalletConnect (Reown) settings the server renders into
 * `<meta name="smx-walletconnect-project-id" content="..." data-name
 * data-description data-url data-icon>` (see `Layout.tsx`). The project id is
 * public. Returns `undefined` when WalletConnect is not configured, so every
 * caller falls back to the injected wallet or the demo burner.
 *
 * Kept tiny and SDK-free: the heavy SDKs load lazily in
 * `walletconnect-evm.ts` and `walletconnect-hedera.ts`.
 */
export function walletConnectConfig() {
	const meta = document.querySelector<HTMLMetaElement>(
		'meta[name="smx-walletconnect-project-id"]',
	)
	const projectId = meta?.content.trim()
	if(!meta || !projectId) {
		return undefined
	}

	const { name, description, url, icon } = meta.dataset
	return {
		projectId,
		metadata: {
			name: name || 'StakeMe Exchange',
			description: description || '',
			url: url || location.origin,
			icons: icon ? [icon] : [],
		},
	}
}

/** localStorage flag: a Hedera wallet paired, so sign-out must end it. */
export const HEDERA_WALLET_FLAG = 'smx.hedera.walletconnect'

/** Message for a closed pairing modal: shown as a status, not an error. */
export const CANCELLED = 'Connection cancelled'

export type WalletConnectConfig = NonNullable<
	ReturnType<typeof walletConnectConfig>
>
