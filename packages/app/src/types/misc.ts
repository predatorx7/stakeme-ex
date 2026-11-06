import type { IDatabaseConnection } from '@pgtyped/runtime'

export interface IAuthenticatedUser {
	id: string
	email: string
	name: string
	/** Primary linked wallet (checksum or lowercase), if any. */
	walletAddress: string | null
}

export type IPgClientLike = IDatabaseConnection
