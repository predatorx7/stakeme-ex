import { createStorageProvider } from '../storage/index.ts'
import type { IStorageProvider } from '../storage/storage-provider.ts'
import type { IOracle } from './oracle.ts'
import { ZeroGravityAgent } from './zero-gravity-agent.ts'

export type * from './oracle.ts'
export { OracleDecorator } from './oracle.ts'
export { ZeroGravityAgent } from './zero-gravity-agent.ts'

/**
 * The oracle adapter. The default is `ZeroGravityAgent`, which also exposes
 * `audit()`. Wrap it in an `OracleDecorator` subclass here to layer another
 * `IOracle` on top.
 */
export function createOracle(
	storage: IStorageProvider = createStorageProvider(),
): IOracle & ZeroGravityAgent {
	return new ZeroGravityAgent(storage)
}
