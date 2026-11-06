export const APP_NAME = 'StakeMe Exchange'
export const APP_DESCRIPTION =
	'A liquid stock market for human potential: invest in creators and earn '
	+ 'dividends from their verified income.'

/** URL prefix the static `public/` folder is mounted at. */
export const PUBLIC_DIR = '/public'

/** Where the Vite dev server serves modules from. */
export const BASE_PATH = '/'

/** `/public/assets/<path>` URL for a static asset. */
export function assetUrl(path: string) {
	return `${PUBLIC_DIR}/assets/${path}`
}

export const IS_PRODUCTION = process.env.NODE_ENV === 'production'
export const IS_DEV = process.env.NODE_ENV === 'development'

/** Demo mode: simulated chain, fixture proofs, demo-only routes. */
export const DEMO_MODE = process.env.DEMO_MODE === '1'

export const DB_URI = process.env.DB_URI
export const MAX_DB_CONNS = +(process.env.MAX_DB_CONNS || 10)
export const PG_APP_NAME = process.env.PG_APP_NAME || 'smx_app'

export const LOG_LEVEL = process.env.LOG_LEVEL || 'info'

/** How long `app.destroy()` waits for in-flight connections. */
export const GRACEFUL_SHUTDOWN_TIMEOUT_S =
	+(process.env.GRACEFUL_SHUTDOWN_TIMEOUT_S || 10)

export const PGMB_GROUP_ID = process.env.PGMB_GROUP_ID || 'smx-worker'

export const PORT = +(process.env.PORT || 4020)

/** Public origin of this deployment, without a trailing slash. */
export function canonicalOrigin() {
	const env = process.env.CANONICAL_ORIGIN?.trim().replace(/\/+$/, '')
	return env || 'http://localhost:4020'
}

// ─── Auth (Better Auth + SIWE) ───

export const AUTH_BASE_PATH = '/auth'

export function betterAuthSecret(): string {
	return process.env.BETTER_AUTH_SECRET || ''
}

/** Extra origins allowed to call the CSRF-protected auth endpoints. */
export function authTrustedOrigins(): string[] {
	const env = process.env.AUTH_TRUSTED_ORIGINS
	if(env === undefined) {
		return IS_PRODUCTION ? [] : ['http://localhost:4020']
	}

	return env
		.split(',')
		.map((o) => o.trim().replace(/\/+$/, ''))
		.filter(Boolean)
}

/** Host the SIWE message must name (EIP-4361 `domain`). */
export function siweDomain() {
	return new URL(canonicalOrigin()).host
}

// ─── Integrations (workstream 5) ───
// Every sponsor integration falls back to a demo path when its vars are unset.
// See docs/integrations/*.md.

/** World ID 4.0. App, RP and signing key come from the Developer Portal. */
export const WORLD_APP_ID = process.env.WORLD_APP_ID || ''
export const WORLD_RP_ID = process.env.WORLD_RP_ID || ''
/** Secret: server only. */
export const WORLD_RP_SIGNING_KEY = process.env.WORLD_RP_SIGNING_KEY || ''
export const WORLD_ACTION = process.env.WORLD_ACTION || 'smx-launch-ipo'
export const WORLD_ENV: 'staging' | 'production' =
	process.env.WORLD_ENV === 'production' ? 'production' : 'staging'

/**
 * WalletConnect (Reown) project id from https://dashboard.reown.com. PUBLIC:
 * the browser needs it (rendered as a `smx-walletconnect-project-id` meta).
 * Unset hides WalletConnect: sign-in uses an injected wallet or the demo
 * burner, and Hedera dividends sign with the demo burner key.
 */
export const WALLETCONNECT_PROJECT_ID =
	process.env.WALLETCONNECT_PROJECT_ID?.trim() || ''

/** Reclaim zkTLS via `@reclaimprotocol/client`. Secrets stay on the server. */
export const RECLAIM_ORG_SECRET = process.env.RECLAIM_ORG_SECRET || ''
export const RECLAIM_PROVIDER_ID = process.env.RECLAIM_PROVIDER_ID || ''
/** Optional: only needed when the org has result encryption on. */
export const RECLAIM_ORG_ETH_PRIVATE_KEY =
	process.env.RECLAIM_ORG_ETH_PRIVATE_KEY || ''
/** Optional Builder API override (defaults to the production Builder). */
export const RECLAIM_BASE_URL = process.env.RECLAIM_BASE_URL || ''

/**
 * EVM chain. Simulated chain mode when `CHAIN_RPC_URL` is unset. A set RPC
 * URL without `CHAIN_ID` means Hedera testnet (296, Hashio).
 */
export const CHAIN_RPC_URL = process.env.CHAIN_RPC_URL || ''
export const CHAIN_ID = +(process.env.CHAIN_ID || 0)
	|| (CHAIN_RPC_URL ? 296 : 0)
/** Secret: oracle + relayer key (signs every job on testnet). */
export const ORACLE_PRIVATE_KEY = process.env.ORACLE_PRIVATE_KEY || ''
export const FACTORY_ADDRESS = process.env.FACTORY_ADDRESS || ''
export const USDC_ADDRESS = process.env.USDC_ADDRESS || ''

/** 0G Compute (audit LLM) + Storage (audit log). */
export const ZG_RPC_URL =
	process.env.ZG_RPC_URL || 'https://evmrpc-testnet.0g.ai'
export const ZG_PRIVATE_KEY = process.env.ZG_PRIVATE_KEY || ''
export const ZG_INDEXER_URL = process.env.ZG_INDEXER_URL
	|| 'https://indexer-storage-testnet-turbo.0g.ai'
export const ZG_PROVIDER_ADDRESS = process.env.ZG_PROVIDER_ADDRESS || ''
export const ZG_LEDGER_DEPOSIT = +(process.env.ZG_LEDGER_DEPOSIT || 3)

/** Storage adapter: `0g` (default, falls back to local) or `local`. */
export const STORAGE_PROVIDER: '0g' | 'local' =
	process.env.STORAGE_PROVIDER === 'local' ? 'local' : '0g'

/** Hedera dividend rail. Unset means simulated receipts. */
export const HEDERA_ACCOUNT_ID = process.env.HEDERA_OPERATOR_ID
	|| process.env.HEDERA_ACCOUNT_ID || ''
export const HEDERA_PRIVATE_KEY = process.env.HEDERA_OPERATOR_KEY
	|| process.env.HEDERA_PRIVATE_KEY || ''
export const HEDERA_DIVIDEND_TOKEN_ID =
	process.env.HEDERA_DIVIDEND_TOKEN_ID || ''
export const HEDERA_NETWORK: 'testnet' | 'mainnet' =
	process.env.HEDERA_NETWORK === 'mainnet' ? 'mainnet' : 'testnet'

/**
 * Hedera Asset Tokenization Studio (ATS) equity token. Behind a flag because
 * ATS needs its own factory + resolver deployed on the target network
 * (docs/integrations/hedera.md). Unset means SIMULATED token ids.
 */
export const ATS_ENABLED = process.env.ATS_ENABLED === '1'
export const ATS_FACTORY_ADDRESS = process.env.ATS_FACTORY_ADDRESS || ''
export const ATS_RESOLVER_ADDRESS = process.env.ATS_RESOLVER_ADDRESS || ''
/** Resolver config version; 0 means the latest registered version. */
export const ATS_CONFIG_VERSION = +(process.env.ATS_CONFIG_VERSION || 0)
/** Hedera JSON-RPC relay used for ATS calls when `CHAIN_RPC_URL` is unset. */
export const HEDERA_RPC_URL =
	process.env.HEDERA_RPC_URL || 'https://testnet.hashio.io/api'

// ─── Backend domain (workstream 4) ───

export const DEFAULT_SHARE_BPS = 500
export const DEFAULT_TERM_MONTHS = 60
/** Escrow schedule in bps of the target raise: tranche 0 releases at IPO. */
export const DEFAULT_TRANCHE_BPS = [2000, 4000, 4000]
export const DEFAULT_MIN_INCOME = '1000.00'
/** Chain id stored on a creator (Hedera testnet when none is configured). */
export const DOMAIN_CHAIN_ID = CHAIN_ID || 296

/** Chain jobs the worker takes per pass. */
export const CHAIN_JOB_BATCH = 20
/** Deadline sweep period for the in-process fallback; 0 disables it. */
export const SWEEP_INTERVAL_S = +(process.env.SWEEP_INTERVAL_S ?? 60)
/** Retry delays for a chain job's pgmb handler. */
export const CHAIN_JOB_RETRIES_S = [5, 30, 120]
