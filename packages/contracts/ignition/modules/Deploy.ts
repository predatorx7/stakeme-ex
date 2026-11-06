import { buildModule } from '@nomicfoundation/hardhat-ignition/modules'

/**
 * Deploys MockUSDC and the LiquidISAFactory. The oracle defaults to the
 * deployer account; override with `--parameters` (key: Deploy.oracle).
 */
export default buildModule('Deploy', (m) => {
	const deployer = m.getAccount(0)
	const oracle = m.getParameter('oracle', deployer)

	const usdc = m.contract('MockUSDC')
	const factory = m.contract('LiquidISAFactory', [usdc, oracle])

	return { usdc, factory }
})
