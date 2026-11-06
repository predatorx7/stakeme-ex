/**
 * Sponsor SDK modules. Routes and workers do not import these directly except
 * for the types and World ID helpers; adapters live in `../services/`.
 */
export type * from './types.ts'
export { verifyWorldIdProof } from './world-id.ts'
export { sendChainJob } from './chain.ts'

// Additive helpers; see the Integrations map in CONTEXT.md.
export { createWorldIdRequest, demoWorldIdProof } from './world-id.ts'
export type { WorldIdRequest } from './world-id.ts'
export { demoIncomeProof } from './reclaim.ts'

// Hedera ATS equity token (workstream 9).
export { mintCreatorEquityToken } from './hedera-ats.ts'
export type { MintEquityInput, MintEquityResult } from './hedera-ats.ts'
