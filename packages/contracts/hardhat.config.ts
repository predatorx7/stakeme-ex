import hardhatToolboxViemPlugin from '@nomicfoundation/hardhat-toolbox-viem'
import { configVariable, defineConfig } from 'hardhat/config'

const compiler = {
	version: '0.8.28',
	settings: {
		viaIR: true,
		optimizer: { enabled: true, runs: 200 },
		evmVersion: 'cancun',
	},
}

export default defineConfig({
	plugins: [hardhatToolboxViemPlugin],
	solidity: {
		profiles: {
			default: compiler,
			production: compiler,
		},
	},
	// Hedera testnet verification: HashScan reads Sourcify. The old
	// server-verify.hashscan.io host 308-redirects to this server. Run
	// `npm run verify:hedera` (scripts/verify-hedera.ts) to verify.
	verify: {
		sourcify: { enabled: true, apiUrl: 'https://sourcify.dev/server' },
	},
	networks: {
		hardhatMainnet: {
			type: 'edr-simulated',
			chainType: 'l1',
		},
		hederaTestnet: {
			type: 'http',
			chainType: 'l1',
			chainId: 296,
			url: 'https://testnet.hashio.io/api',
			accounts: [configVariable('HEDERA_PRIVATE_KEY')],
		},
		sepolia: {
			type: 'http',
			chainType: 'l1',
			url: configVariable('SEPOLIA_RPC_URL'),
			accounts: [configVariable('SEPOLIA_PRIVATE_KEY')],
		},
		ogGalileo: {
			type: 'http',
			chainType: 'l1',
			chainId: 16602,
			url: 'https://evmrpc-testnet.0g.ai',
			accounts: [configVariable('OG_PRIVATE_KEY')],
		},
	},
})
