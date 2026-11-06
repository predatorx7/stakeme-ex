/**
 * Sponsor integrations. Each module owns one sponsor and exposes the
 * functions below with the signatures in `./types.ts`. Workstream 5
 * implements them; until then they're declared so the backend typechecks.
 */
export type * from './types.ts'
export { verifyWorldIdProof } from './world-id.ts'
export { createReclaimSession, verifyIncomeProof } from './reclaim.ts'
export { auditIncome } from './zero-g.ts'
export { storeTerms } from './arkiv.ts'
export { sendChainJob } from './chain.ts'
export { streamDividend } from './hedera-x402.ts'

// Additive helpers (workstream 5); see the Integrations map in CONTEXT.md.
export { createWorldIdRequest, demoWorldIdProof } from './world-id.ts'
export type { WorldIdRequest } from './world-id.ts'
export { demoIncomeProof } from './reclaim.ts'
