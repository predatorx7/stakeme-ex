import { buildModule } from '@nomicfoundation/hardhat-ignition/modules'

/**
 * Deploys MockUSDC, the two clone implementations and the LiquidISAFactory. The oracle defaults to the
 * deployer account; override with `--parameters` (key: Deploy.oracle).
 */
export default buildModule('Deploy', (m) => {
	const deployer = m.getAccount(0)
	const oracle = m.getParameter('oracle', deployer)

	const usdc = m.contract('MockUSDC')
	const isaImpl = m.contract('LiquidISA')
	const tokenImpl = m.contract('CreatorShareToken')
	const poolImpl = m.contract('CreatorPool')
	const factory = m.contract('LiquidISAFactory', [usdc, oracle, isaImpl, tokenImpl, poolImpl])

	return { usdc, isaImpl, tokenImpl, poolImpl, factory }
})
