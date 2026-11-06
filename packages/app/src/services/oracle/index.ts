import type { IOracle } from './oracle.ts'
import { ZeroGravityAgent } from './zero-gravity-agent.ts'

export type * from './oracle.ts'
export { OracleDecorator } from './oracle.ts'
export { type OracleAudit, ZeroGravityAgent } from './zero-gravity-agent.ts'

/**
 * The oracle adapter. The default is `ZeroGravityAgent`, which also exposes
 * `audit()`. Wrap it in an `OracleDecorator` subclass here to layer another
 * `IOracle` on top.
 */
export function createOracle(): IOracle & ZeroGravityAgent {
	return new ZeroGravityAgent()
}
