// Deploys the LiquidISA and CreatorShareToken implementations and the
// clone factory to Hedera testnet with viem and explicit gas limits.
// Hardhat Ignition's automatic gas limit gets HTTP 400 from Hashio, and Hedera
// bills at least 80% of the gas limit, so each limit is estimateGas + 20%.
//
//   npm run deploy:hedera              reuse the MockUSDC in the root .env
//   npm run deploy:hedera -- --new-usdc  also deploy a fresh MockUSDC
//
// Reads ORACLE_PRIVATE_KEY (deployer = oracle) from the root .env, updates
// FACTORY_ADDRESS (and USDC_ADDRESS with --new-usdc) there in place, and writes
// deployments/hedera-testnet.json. Run `npm run abis` to refresh the generated
// deployments file.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
	type Abi,
	type Address,
	createPublicClient,
	createWalletClient,
	defineChain,
	encodeDeployData,
	formatEther,
	type Hex,
	http,
	isAddress,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const envFile = join(root, '../../.env')
const outFile = join(root, 'deployments/hedera-testnet.json')
const RPC = 'https://testnet.hashio.io/api'
const MIRROR = 'https://testnet.mirrornode.hedera.com/api/v1'
const MARGIN = 120n // percent

const newUsdc = process.argv.includes('--new-usdc')
const env = readEnv()
const key = env.ORACLE_PRIVATE_KEY
if(!key) {
	throw new Error('ORACLE_PRIVATE_KEY missing from the root .env')
}

const chain = defineChain({
	id: 296,
	name: 'Hedera Testnet',
	// Hedera's EVM view uses 18 decimals for tinybar-denominated HBAR.
	nativeCurrency: { name: 'HBAR', symbol: 'HBAR', decimals: 18 },
	rpcUrls: { default: { http: [RPC] } },
})
const transport = http(RPC, { retryCount: 6, retryDelay: 1500, timeout: 60_000 })
const account = privateKeyToAccount(key as Hex)
const pub = createPublicClient({ chain, transport })
const wallet = createWalletClient({ account, chain, transport })

const startBalance = await pub.getBalance({ address: account.address })
console.log(`Deployer ${account.address}, balance ${formatEther(startBalance)} HBAR`)

const deployed: Record<string, Address> = {}
const gasUsed: Record<string, bigint> = {}

if(newUsdc) {
	deployed.MockUSDC = await deploy('MockUSDC')
} else {
	const existing = env.USDC_ADDRESS
	if(!existing || !isAddress(existing)) {
		throw new Error('USDC_ADDRESS missing in .env; pass --new-usdc')
	}

	deployed.MockUSDC = existing
}

deployed.LiquidISA = await deploy('LiquidISA')
deployed.CreatorShareToken = await deploy('CreatorShareToken')
deployed.LiquidISAFactory = await deploy('LiquidISAFactory', [
	deployed.MockUSDC,
	account.address,
	deployed.LiquidISA,
	deployed.CreatorShareToken,
])

const endBalance = await pub.getBalance({ address: account.address })
const spent = startBalance - endBalance
console.log('\nDeployed:')
for(const [name, address] of Object.entries(deployed)) {
	console.log(`  ${name.padEnd(18)} ${address}`)
}

console.log(`HBAR spent: ${formatEther(spent)}`)

writeFileSync(
	outFile,
	JSON.stringify(
		{
			chainId: 296,
			network: 'hedera-testnet',
			oracle: account.address,
			deployedAt: new Date().toISOString(),
			hbarSpent: formatEther(spent),
			contracts: deployed,
		},
		null,
		2,
	) + '\n',
)
updateEnv({
	FACTORY_ADDRESS: deployed.LiquidISAFactory,
	...(newUsdc ? { USDC_ADDRESS: deployed.MockUSDC } : {}),
})
console.log(`Wrote ${outFile} and updated .env`)

async function deploy(name: string, args: unknown[] = []) {
	const file = join(root, 'artifacts/contracts', `${name}.sol`, `${name}.json`)
	if(!existsSync(file)) {
		throw new Error(`Missing artifact ${file}. Run \`hardhat compile\` first.`)
	}

	const { abi, bytecode } = JSON.parse(readFileSync(file, 'utf8'))
	const request = { abi, bytecode: bytecode as Hex, args }
	const estimate = await estimateDeploy(request)
	const gas = (estimate * MARGIN) / 100n
	const hash = await wallet.deployContract({ ...request, gas })
	const receipt = await pub.waitForTransactionReceipt({ hash })
	if(receipt.status !== 'success' || !receipt.contractAddress) {
		throw new Error(`${name} deploy failed (tx ${hash})`)
	}

	gasUsed[name] = receipt.gasUsed
	console.log(
		`${name}: ${receipt.contractAddress} gas limit ${gas}, used ${receipt.gasUsed}`
		+ ` https://hashscan.io/testnet/transaction/${hash}`,
	)
	await waitForMirror(receipt.contractAddress)
	return receipt.contractAddress
}

async function estimateDeploy(
	{ abi, bytecode, args }: { abi: Abi, bytecode: Hex, args: unknown[] },
) {
	// Artifacts are untyped JSON, so viem's literal ABI typing can't apply.
	const data = encodeDeployData({ abi, bytecode, args })
	return pub.estimateGas({ account: account.address, data })
}

/** Hashio reads fail with FAIL_INVALID until the mirror node knows a new contract. */
async function waitForMirror(address: string) {
	for(let i = 0; i < 60; i++) {
		const res = await fetch(`${MIRROR}/contracts/${address}`).catch(() => null)
		if(res?.ok) {
			return
		}

		await new Promise((r) => setTimeout(r, 2000))
	}

	throw new Error(`Mirror node never returned ${address}`)
}

function readEnv() {
	const out: Record<string, string> = {}
	for(const line of readFileSync(envFile, 'utf8').split('\n')) {
		const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
		if(m) {
			out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
		}
	}

	return out
}

/** Replaces `KEY=` lines in place (or appends); every other line stays untouched. */
function updateEnv(values: Record<string, string>) {
	let text = readFileSync(envFile, 'utf8')
	for(const [k, v] of Object.entries(values)) {
		const re = new RegExp(`^${k}=.*$`, 'm')
		text = re.test(text)
			? text.replace(re, () => `${k}=${v}`)
			: text.replace(/\n?$/, `\n${k}=${v}\n`)
	}

	writeFileSync(envFile, text)
}
