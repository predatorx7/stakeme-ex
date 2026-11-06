import { badRequest } from '@hapi/boom'
import assert from 'node:assert'
import {
	type Address,
	createPublicClient,
	createWalletClient,
	getAddress,
	type Hex,
	http,
	parseAbi,
	parseEventLogs,
	zeroAddress,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import {
	ATS_CONFIG_VERSION,
	ATS_ENABLED,
	ATS_FACTORY_ADDRESS,
	ATS_RESOLVER_ADDRESS,
	CHAIN_RPC_URL,
	HEDERA_NETWORK,
	HEDERA_PRIVATE_KEY,
	HEDERA_RPC_URL,
} from '../consts.ts'
import { LOGGER } from '../logger.ts'
import { keccakUtf8 } from './util.ts'

/**
 * Hedera Asset Tokenization Studio (ATS) equity tokens, driven from Node.
 *
 * Why not `@hashgraph/asset-tokenization-sdk`: v8.0.0 only signs through
 * WalletConnect, MetaMask, DFNS, Fireblocks or AWS KMS (no operator private key
 * signer), ships extensionless ESM imports that Node cannot load, and pulls
 * Reown/WalletConnect. The SDK is a thin wrapper over the ATS `Factory` and
 * `Equity` diamond contracts, so we call the same contracts with viem through
 * the Hedera JSON-RPC relay, using the operator's ECDSA key.
 *
 * The ATS token is the regulated registry mirror of a creator's cap table.
 * `LiquidISA` keeps `CreatorShareToken` as the dividend/escrow source of truth
 * (ATS tokens carry their own corporate-action logic and cannot reuse the
 * ISA's O(1) dividend accounting).
 */

/** `EQUITY_CONFIG_ID` from `@hashgraph/asset-tokenization-contracts`. */
const EQUITY_CONFIG_ID: Hex =
	'0x0000000000000000000000000000000000000000000000000000000000000001'
/** `ROLE_ISSUER` (v8 hash of `asset.tokenization.standard.role.Issuer`). */
const ROLE_ISSUER: Hex =
	'0x5eeaf5602c75bf26e73b5206d0bd6ee82f621166255e5fd73cc06bc7bd84a95f'
/** Pre-v8 `ROLE_ISSUER`; the public testnet deployment predates v8. */
const ROLE_ISSUER_V7: Hex =
	'0x4be32e8849414d19186807008dabd451c1d87dae5f8e22f32f5ce94d486da842'
const DEFAULT_ADMIN_ROLE: Hex = `0x${'00'.repeat(32)}`

/* eslint-disable @stylistic/max-len -- one-line human-readable ABI structs */
const atsFactoryAbi = parseAbi([
	'struct ResolverProxyConfiguration { bytes32 key; uint256 version; }',
	'struct ERC20MetadataInfo { string name; string symbol; string isin; uint8 decimals; }',
	'struct Rbac { bytes32 role; address[] members; }',
	'struct SecurityData { address resolver; uint256 maxSupply; ResolverProxyConfiguration resolverProxyConfiguration; ERC20MetadataInfo erc20MetadataInfo; Rbac[] rbacs; address[] externalPauses; address[] externalControlLists; address[] externalKycLists; address compliance; address identityRegistry; bool arePartitionsProtected; bool isMultiPartition; bool isControllable; bool isWhiteList; bool clearingActive; bool internalKycActivated; bool erc20VotesActivated; }',
	'struct EquityDetailsData { bool votingRight; bool informationRight; bool liquidationRight; bool subscriptionRight; bool conversionRight; bool redemptionRight; bool putRight; uint8 dividendRight; bytes3 currency; uint256 nominalValue; uint8 nominalValueDecimals; }',
	'struct EquityData { SecurityData security; EquityDetailsData equityDetails; }',
	'struct AdditionalSecurityData { bool countriesControlListType; string listOfCountries; string info; }',
	'struct FactoryRegulationData { uint8 regulationType; uint8 regulationSubType; AdditionalSecurityData additionalSecurityData; }',
	'function deployEquity(EquityData _equityData, FactoryRegulationData _factoryRegulationData) returns (address equityAddress_)',
	'event EquityDeployed(address indexed deployer, address equityAddress, EquityData equityData, FactoryRegulationData regulationData)',
])

/* eslint-enable @stylistic/max-len */

const atsMintAbi = parseAbi([
	'function mint(address _to, uint256 _amount)',
])

export type MintEquityInput = {
	ticker: string
	name: string
	/** Whole shares (decimal string or bigint) before applying `decimals`. */
	supply: string | bigint
	decimals: number
	/** EVM address that receives the minted supply (and the admin role). */
	holder: string
}

export type MintEquityResult = {
	/** ATS equity diamond EVM address (`sim:` prefixed hash when simulated). */
	tokenId: string
	evmAddress: string
	txId: string
	/** Deploy tx hash (live only). */
	deployTxHash?: string
	/** HashScan link to the token (live only). */
	hashscanUrl?: string
	status: 'CONFIRMED' | 'SIMULATED'
}

/**
 * Public ATS reference deployment on Hedera testnet (hashgraph/asset-
 * tokenization-studio, `deployments/hedera-testnet/newBlr-2026-06-12...json`).
 * Factory proxy 0.0.9213391, BLR proxy 0.0.9212226, equity config v1.
 * Used when `ATS_MODE=live` and no explicit addresses are set. Testnet may be
 * reset and these contracts expire, so override with `ATS_*_ADDRESS`.
 */
const PUBLIC_TESTNET_FACTORY = '0xd1F118A40f3b02883D35909eF2517e7EDd78379d'
const PUBLIC_TESTNET_BLR = '0xBA2D5FC2083A0b8f164c50e65d782087fBA18E0a'

/** `ATS_MODE=live|simulated` (default simulated). `ATS_ENABLED=1` = live. */
export function atsMode(): 'live' | 'simulated' {
	return process.env.ATS_MODE === 'live' || ATS_ENABLED
		? 'live'
		: 'simulated'
}

export function atsFactoryAddress() {
	return ATS_FACTORY_ADDRESS
		|| (HEDERA_NETWORK === 'testnet' ? PUBLIC_TESTNET_FACTORY : '')
}

export function atsResolverAddress() {
	return ATS_RESOLVER_ADDRESS
		|| (HEDERA_NETWORK === 'testnet' ? PUBLIC_TESTNET_BLR : '')
}

/** True only in live mode with the operator key and both ATS contracts. */
export function isAtsConfigured() {
	return atsMode() === 'live'
		&& !!HEDERA_PRIVATE_KEY
		&& !!atsFactoryAddress()
		&& !!atsResolverAddress()
}

/**
 * Deploys an ATS equity token and mints `supply` to `holder`. Without an
 * operator key or ATS contract addresses (or when the call fails) the result
 * is SIMULATED with deterministic ids, so the demo runs with no keys.
 */
export async function mintCreatorEquityToken(
	input: MintEquityInput,
): Promise<MintEquityResult> {
	if(!isAtsConfigured()) {
		LOGGER.warn({ ticker: input.ticker }, 'ATS not configured: simulated token')
		return simulateEquityToken(input)
	}

	try {
		return await mintReal(input)
	} catch(err) {
		LOGGER.error({ err, ticker: input.ticker }, 'ATS mint failed: simulating')
		return simulateEquityToken(input)
	}
}

/** Pure: deterministic fake token (address + tx id) from the input. */
export function simulateEquityToken(input: MintEquityInput): MintEquityResult {
	const seed = `ats:${input.ticker}:${input.holder}:${input.supply}`
	const evmAddress = getAddress(`0x${keccakUtf8(seed).slice(-40)}`)
	return {
		tokenId: evmAddress,
		evmAddress,
		txId: `sim:${keccakUtf8(`${seed}:tx`)}`,
		status: 'SIMULATED',
	}
}

/**
 * Pure: ISIN-shaped id (12 chars, valid check digit) the ATS Factory demands.
 * `XS` + 9 chars from the ticker hash + ISO 6166 Luhn check digit.
 */
export function syntheticIsin(ticker: string) {
	const body = `XS${keccakUtf8(ticker).slice(2, 11).toUpperCase()}`
	// Letters map to 10..35, then the digit string goes through Luhn.
	const digits = [...body]
		.map((c) => (/\d/.test(c) ? c : String(c.charCodeAt(0) - 55)))
		.join('')
	let sum = 0
	for(let i = 0; i < digits.length; i++) {
		// Rightmost digit of the payload is doubled.
		let d = +digits[digits.length - 1 - i]
		if(i % 2 === 0) {
			d *= 2
			if(d > 9) {
				d -= 9
			}
		}

		sum += d
	}

	return `${body}${(10 - (sum % 10)) % 10}`
}

async function mintReal(input: MintEquityInput): Promise<MintEquityResult> {
	const key = normalizeEcdsaKey(HEDERA_PRIVATE_KEY)
	const account = privateKeyToAccount(key)
	const holder = getAddress(input.holder)
	const supply = scaleSupply(input.supply, input.decimals)
	// Hashio is flaky: long timeout plus retries.
	const transport = http(CHAIN_RPC_URL || HEDERA_RPC_URL, {
		timeout: 90_000,
		retryCount: 3,
	})
	const publicClient = createPublicClient({ transport })
	const wallet = createWalletClient({ account, transport })
	const factory = getAddress(atsFactoryAddress())

	const deployHash = await wallet.writeContract({
		chain: null,
		address: factory,
		abi: atsFactoryAbi,
		functionName: 'deployEquity',
		args: buildDeployEquityArgs(input, account.address),
	})
	const deployReceipt = await publicClient.waitForTransactionReceipt({
		hash: deployHash,
	})
	assert(
		deployReceipt.status === 'success',
		new Error('ATS deployEquity reverted'),
	)
	const [deployed] = parseEventLogs({
		abi: atsFactoryAbi,
		eventName: 'EquityDeployed',
		logs: deployReceipt.logs,
	})
	assert(deployed, new Error('EquityDeployed event missing from receipt'))
	const equity: Address = deployed.args.equityAddress

	const mintHash = await wallet.writeContract({
		chain: null,
		address: equity,
		abi: atsMintAbi,
		functionName: 'mint',
		args: [holder, supply],
	})
	const mintReceipt = await publicClient.waitForTransactionReceipt({
		hash: mintHash,
	})
	assert(mintReceipt.status === 'success', new Error('ATS mint reverted'))

	return {
		tokenId: equity,
		evmAddress: equity,
		txId: mintHash,
		deployTxHash: deployHash,
		hashscanUrl: `https://hashscan.io/${HEDERA_NETWORK}/contract/${equity}`,
		status: 'CONFIRMED',
	}
}

/** Pure: `Factory.deployEquity` arguments. */
export function buildDeployEquityArgs(
	input: MintEquityInput,
	issuer: Address,
) {
	const holder = getAddress(input.holder)
	const supply = scaleSupply(input.supply, input.decimals)
	return [
		{
			security: {
				resolver: getAddress(atsResolverAddress()),
				maxSupply: supply,
				resolverProxyConfiguration: {
					key: EQUITY_CONFIG_ID,
					version: BigInt(ATS_CONFIG_VERSION || 1),
				},
				erc20MetadataInfo: {
					name: input.name,
					symbol: input.ticker,
					isin: syntheticIsin(input.ticker),
					decimals: input.decimals,
				},
				rbacs: [
					{ role: DEFAULT_ADMIN_ROLE, members: [...new Set([holder, issuer])] },
					// The operator mints; the holder is only an admin. Role hashes
					// changed between ATS releases, so grant both ISSUER hashes.
					{ role: ROLE_ISSUER, members: [issuer] },
					{ role: ROLE_ISSUER_V7, members: [issuer] },
				],
				externalPauses: [],
				externalControlLists: [],
				externalKycLists: [],
				compliance: zeroAddress,
				identityRegistry: zeroAddress,
				arePartitionsProtected: false,
				isMultiPartition: false,
				isControllable: true,
				isWhiteList: false,
				clearingActive: false,
				internalKycActivated: false,
				erc20VotesActivated: false,
			},
			equityDetails: {
				votingRight: false,
				informationRight: true,
				liquidationRight: true,
				subscriptionRight: false,
				conversionRight: false,
				redemptionRight: false,
				putRight: false,
				dividendRight: 2, // COMMON
				currency: '0x555344', // "USD"
				nominalValue: 1n,
				nominalValueDecimals: 0,
			},
		},
		{
			regulationType: 2, // REG_D
			regulationSubType: 1, // 506(b)
			additionalSecurityData: {
				countriesControlListType: false,
				listOfCountries: '',
				info: 'StakeMe Exchange income-share equity',
			},
		},
	] as const
}

/** Pure: whole-share amount (decimal string) to base units. */
export function scaleSupply(supply: string | bigint, decimals: number) {
	assert(
		Number.isInteger(decimals) && decimals >= 0 && decimals <= 18,
		badRequest('decimals must be an integer in 0..18'),
	)
	const whole = typeof supply === 'bigint' ? supply.toString() : supply
	assert(/^\d+$/.test(whole), badRequest('supply must be whole shares'))
	return BigInt(whole) * 10n ** BigInt(decimals)
}

/**
 * Accepts a raw 0x hex ECDSA key or a Hedera DER-encoded hex key
 * (`302e0201...0420<32 bytes>`) and returns the 0x hex form.
 */
export function normalizeEcdsaKey(raw: string): Hex {
	const hex = raw.replace(/^0x/, '')
	assert(
		/^[0-9a-fA-F]+$/.test(hex) && hex.length >= 64,
		badRequest('HEDERA_OPERATOR_KEY must be an ECDSA hex key'),
	)
	return `0x${hex.slice(-64)}`
}
