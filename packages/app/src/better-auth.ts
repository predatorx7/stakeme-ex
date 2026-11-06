import type { PGlite } from '@electric-sql/pglite'
import { betterAuth } from 'better-auth'
import { bearer } from 'better-auth/plugins'
import { siwe } from 'better-auth/plugins/siwe'
import { type Dialect, Kysely, PostgresDialect, WithSchemaPlugin } from 'kysely'
import type { Pool } from 'pg'
import { verifyMessage } from 'viem'
import { generateSiweNonce } from 'viem/siwe'
import type { IPgClientLike } from './types/index.ts'
import {
	AUTH_BASE_PATH,
	authTrustedOrigins,
	betterAuthSecret,
	canonicalOrigin,
	siweDomain,
} from './consts.ts'

// Better Auth's tables live in the `smx` schema (vendored in ddl.sql). The
// WithSchemaPlugin qualifies every Better Auth query to that schema so it works
// regardless of the connection's search_path.
const AUTH_SCHEMA = 'smx'

// Snake-case column maps: Better Auth's camelCase model fields map to our
// snake_case columns. Type inference still uses the camelCase names in code;
// only storage changes. Regenerate the vendored schema after editing (see
// ddl.sql).
const SESSION_FIELDS = {
	userId: 'user_id',
	expiresAt: 'expires_at',
	createdAt: 'created_at',
	updatedAt: 'updated_at',
	ipAddress: 'ip_address',
	userAgent: 'user_agent',
} as const
const ACCOUNT_FIELDS = {
	accountId: 'account_id',
	providerId: 'provider_id',
	userId: 'user_id',
	accessToken: 'access_token',
	refreshToken: 'refresh_token',
	idToken: 'id_token',
	accessTokenExpiresAt: 'access_token_expires_at',
	refreshTokenExpiresAt: 'refresh_token_expires_at',
	createdAt: 'created_at',
	updatedAt: 'updated_at',
} as const
const VERIFICATION_FIELDS = {
	expiresAt: 'expires_at',
	createdAt: 'created_at',
	updatedAt: 'updated_at',
} as const
const WALLET_ADDRESS_FIELDS = {
	userId: 'user_id',
	chainId: 'chain_id',
	isPrimary: 'is_primary',
	createdAt: 'created_at',
} as const

/**
 * The Kysely dialect Better Auth should use over the app's connection. A
 * pg.Pool (prod) exposes `connect()`; PGlite (dev and tests) does not.
 * kysely-pglite is a devDependency, imported lazily so it never loads in prod.
 */
async function resolveAuthDialect(pg: IPgClientLike): Promise<Dialect> {
	if(typeof (pg as { connect?: unknown }).connect === 'function') {
		// pg is a pg.Pool here; IPgClientLike is the structural supertype.
		return new PostgresDialect({ pool: pg as unknown as Pool })
	}

	const { KyselyPGlite } = await import('kysely-pglite')
	// Cast bridges kysely-pglite's bundled kysely Dialect to the app's — same
	// shape, version skew only.
	return new KyselyPGlite(pg as unknown as PGlite).dialect as unknown as Dialect
}

/** The Kysely handle Better Auth uses, schema-qualified to `smx`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function authDbFromDialect(dialect: Dialect): Kysely<any> {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return new Kysely<any>({ dialect }).withPlugin(
		new WithSchemaPlugin(AUTH_SCHEMA),
	)
}

/**
 * Builds the app's Better Auth instance: sign-in with Ethereum (EIP-4361)
 * only. `createAuth` takes the SAME connection the app runs on (a pg.Pool in
 * prod, PGlite in dev and tests) so both read and write one database.
 *
 * Browser flow: `POST /auth/siwe/nonce`, sign the SIWE message with the
 * wallet, `POST /auth/siwe/verify`. The session is a cookie, or a bearer
 * token for API clients.
 */
export async function createAuth(pg: IPgClientLike) {
	return betterAuth({
		baseURL: canonicalOrigin(),
		basePath: AUTH_BASE_PATH,
		secret: betterAuthSecret(),
		trustedOrigins: authTrustedOrigins(),
		advanced: { database: { generateId: 'uuid' } },
		database: {
			db: authDbFromDialect(await resolveAuthDialect(pg)),
			type: 'postgres',
		},
		user: {
			modelName: 'users',
			fields: {
				emailVerified: 'email_verified',
				createdAt: 'created_at',
				updatedAt: 'updated_at',
			},
		},
		session: { fields: SESSION_FIELDS },
		account: { fields: ACCOUNT_FIELDS },
		verification: { fields: VERIFICATION_FIELDS },
		plugins: [
			siwe({
				domain: siweDomain(),
				// SIWE users have no inbox, so skip the email requirement.
				anonymous: true,
				getNonce: async() => generateSiweNonce(),
				// EOA signature check (ecrecover); no RPC needed.
				verifyMessage: ({ message, signature, address }) => verifyMessage({
					address: address as `0x${string}`,
					message,
					signature: signature as `0x${string}`,
				}),
				schema: {
					walletAddress: {
						modelName: 'wallet_addresses',
						fields: WALLET_ADDRESS_FIELDS,
					},
				},
			}),
			// Lets the session token be sent as `Authorization: Bearer <token>`
			// (in addition to the cookie) for API clients.
			bearer(),
		],
	})
}

export type Auth = Awaited<ReturnType<typeof createAuth>>
