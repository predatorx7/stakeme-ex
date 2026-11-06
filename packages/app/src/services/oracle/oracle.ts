import type {
	ProofRequestStatus,
	ReclaimSession,
	ReclaimSessionInput,
	VerifiedIncome,
} from '../../integrations/types.ts'

/** What `fetchVerifiedIncome` needs besides the callback body. */
export type OracleProofPayload = {
	/** The delivery as received (untrusted), or a demo fixture. */
	body: unknown
	/** Our own session row: the expectations the result is checked against. */
	sessionId?: string
	orgId?: string | null
	creatorId: string
}

/**
 * Source of verified income. It opens a proof request for the creator and
 * turns the delivered result into `VerifiedIncome`, throwing a Boom when it
 * does not verify (503 when a retry may succeed).
 */
export interface IOracle {
	readonly name: string
	createProofRequest(input: ReclaimSessionInput): Promise<ReclaimSession>
	/** `payload` is an `OracleProofPayload`. */
	fetchVerifiedIncome(payload: unknown): Promise<VerifiedIncome>
	/** Remote session status for the polling fallback; null when unknown. */
	getProofRequestStatus(sessionId: string): Promise<ProofRequestStatus | null>
}

/**
 * Wrapper seam: an `IOracle` that delegates to another one, for example to
 * add a second opinion or a relay in front of `ZeroGravityAgent`.
 */
export abstract class OracleDecorator implements IOracle {

	readonly #inner: IOracle

	constructor(inner: IOracle) {
		this.#inner = inner
	}

	get name() {
		return this.#inner.name
	}

	createProofRequest(input: ReclaimSessionInput) {
		return this.#inner.createProofRequest(input)
	}

	fetchVerifiedIncome(payload: unknown) {
		return this.#inner.fetchVerifiedIncome(payload)
	}

	getProofRequestStatus(sessionId: string) {
		return this.#inner.getProofRequestStatus(sessionId)
	}

}
