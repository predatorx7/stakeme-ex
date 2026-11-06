import { badRequest } from '@hapi/boom'
import {
	liquidISAAbi,
	liquidISAFactoryAbi,
	mockUSDCAbi,
} from '@stakeme/contracts'
import assert from 'node:assert'
import {
	type Abi,
	type Address,
	BaseError,
	ContractFunctionRevertedError,
	createPublicClient,
	createWalletClient,
	defineChain,
	getAddress,
	type Hex,
	http,
	parseEventLogs,
	parseUnits,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import {
	CHAIN_ID,
	CHAIN_RPC_URL,
	FACTORY_ADDRESS,
	ORACLE_PRIVATE_KEY,
} from '../consts.ts'
import { LOGGER } from '../logger.ts'
import type { ChainJob, ChainJobResult } from './types.ts'
import { keccakUtf8, nullifierHash } from './util.ts'

const USDC_DECIMALS = 6
const DEFAULT_TRANCHES = [2000, 4000, 4000]

export function isChainConfigured() {
	return !!CHAIN_RPC_URL
}

/**
 * Sends one `chain_jobs` row onchain and waits for the receipt.
 *
 * Demo simplification: the creator-side calls (`createISA`, `initializeIPO`,
 * `invest`, `distributeDividend`) are normally signed by users. On testnet the
 * oracle key signs them all (the Arc / EIP-3009 relayer shortcut), so the
 * oracle is the creator and the investor of record. USDC is minted (MockUSDC)
 * and approved on the fly when short.
 *
 * Without `CHAIN_RPC_URL` the job is SIMULATED: deterministic fake hashes.
 */
export async function sendChainJob(job: ChainJob): Promise<ChainJobResult> {
	if(!isChainConfigured()) {
		LOGGER.warn({ job: job.id, fn: job.fn }, 'Chain RPC unset: simulated chain')
		return simulateChainJob(job)
	}

	try {
		return await sendReal(job)
	} catch(err) {
		const error = describeError(err)
		LOGGER.error({ err, job: job.id, fn: job.fn }, 'Chain job failed')
		return { status: 'FAILED', txHash: null, error }
	}
}

/** Pure: deterministic fake receipt (hash = keccak256 of the job id). */
export function simulateChainJob(job: ChainJob): ChainJobResult {
	const txHash = keccakUtf8(job.id)
	const result: ChainJobResult = { status: 'SIMULATED', txHash }
	if(job.fn === 'createISA') {
		result.deployed = {
			isa: fakeAddress(`isa:${job.id}`),
			token: fakeAddress(`token:${job.id}`),
		}
	}

	return result
}

async function sendReal(job: ChainJob): Promise<ChainJobResult> {
	assert(ORACLE_PRIVATE_KEY, new Error('ORACLE_PRIVATE_KEY is not set'))
	const account = privateKeyToAccount(ORACLE_PRIVATE_KEY as Hex)
	const transport = http(CHAIN_RPC_URL)
	const chainId = CHAIN_ID
		|| await createPublicClient({ transport }).getChainId()
	const chain = defineChain({
		id: chainId,
		name: `chain-${chainId}`,
		nativeCurrency: { name: 'Native', symbol: 'ETH', decimals: 18 },
		rpcUrls: { default: { http: [CHAIN_RPC_URL] } },
	})
	const publicClient = createPublicClient({ chain, transport })
	const wallet = createWalletClient({ account, chain, transport })

	const { args } = job
	const target = (job.fn === 'createISA'
		? job.contractAddress || FACTORY_ADDRESS
		: job.contractAddress)
	assert(target, badRequest(`${job.fn} needs a contract address`))
	const to = getAddress(target)

	const send = async(
		call: {
			address: Address
			abi: Abi
			functionName: string
			args?: readonly unknown[]
		},
	) => {
		const { request } = await publicClient.simulateContract({
			account,
			...call,
		})
		const hash = await wallet.writeContract(request)
		const receipt = await publicClient.waitForTransactionReceipt({ hash })
		return { hash, receipt }
	}

	switch (job.fn) {
		case 'createISA': {
			const nullHash = typeof args.worldIdNullifierHash === 'string'
				? args.worldIdNullifierHash as Hex
				: nullifierHash(str(args.worldIdNullifier, 'worldIdNullifier'))
			const given = Array.isArray(args.trancheBps) ? args.trancheBps : []
			const trancheBps = given.length ? given.map(Number) : DEFAULT_TRANCHES
			const { hash, receipt } = await send({
				address: to,
				abi: liquidISAFactoryAbi,
				functionName: 'createISA',
				args: [
					str(args.name, 'name'),
					str(args.ticker, 'ticker'),
					usdc(args.totalRaise, 'totalRaise'),
					usdc(args.creatorStake ?? '0', 'creatorStake'),
					Number(args.shareBps),
					Number(args.termMonths),
					trancheBps,
					nullHash,
				],
			})
			if(receipt.status !== 'success') {
				return failed(hash, 'createISA reverted')
			}

			const [created] = parseEventLogs({
				abi: liquidISAFactoryAbi,
				eventName: 'ISACreated',
				logs: receipt.logs,
			})
			assert(created, new Error('ISACreated event missing from receipt'))
			return {
				status: 'CONFIRMED',
				txHash: hash,
				deployed: { isa: created.args.isa, token: created.args.token },
			}
		}

		case 'initializeIPO': {
			const stake = await publicClient.readContract({
				address: to,
				abi: liquidISAAbi,
				functionName: 'creatorStake',
			})
			await fundAndApprove(to, stake)
			return finish(await send({
				address: to, abi: liquidISAAbi, functionName: 'initializeIPO',
			}))
		}

		case 'invest': {
			const amount = usdc(args.amount, 'amount')
			await fundAndApprove(to, amount)
			return finish(await send({
				address: to, abi: liquidISAAbi, functionName: 'invest', args: [amount],
			}))
		}

		case 'distributeDividend': {
			const amount = usdc(args.amount, 'amount')
			await fundAndApprove(to, amount)
			return finish(await send({
				address: to,
				abi: liquidISAAbi,
				functionName: 'distributeDividend',
				args: [amount],
			}))
		}

		case 'unlockNextTranche':
		case 'executeLiquidation':
			return finish(await send({
				address: to, abi: liquidISAAbi, functionName: job.fn,
			}))
	}

	/** Mint (MockUSDC only) and approve `amount` of the ISA's USDC. */
	async function fundAndApprove(isa: Address, amount: bigint) {
		if(amount === 0n) {
			return
		}

		const token = await publicClient.readContract({
			address: isa, abi: liquidISAAbi, functionName: 'usdc',
		})
		const balance = await publicClient.readContract({
			address: token,
			abi: mockUSDCAbi,
			functionName: 'balanceOf',
			args: [account.address],
		})
		if(balance < amount) {
			try {
				const mint = await wallet.writeContract({
					address: token,
					abi: mockUSDCAbi,
					functionName: 'mint',
					args: [account.address, amount - balance],
				})
				await publicClient.waitForTransactionReceipt({ hash: mint })
			} catch(err) {
				// Real USDC has no open mint: the oracle must already hold it.
				LOGGER.warn({ err }, 'USDC mint skipped')
			}
		}

		const approve = await wallet.writeContract({
			address: token,
			abi: mockUSDCAbi,
			functionName: 'approve',
			args: [isa, amount],
		})
		await publicClient.waitForTransactionReceipt({ hash: approve })
	}
}

function describeError(err: unknown) {
	if(err instanceof BaseError) {
		const revert = err.walk((e) => e instanceof ContractFunctionRevertedError)
		if(revert instanceof ContractFunctionRevertedError) {
			const name = revert.data?.errorName || revert.reason
			return name ? `${err.shortMessage} (${name})` : err.shortMessage
		}

		return err.shortMessage
	}

	return (err instanceof Error ? err.message : String(err)).slice(0, 500)
}

function finish(
	{ hash, receipt }: { hash: Hex, receipt: { status: string } },
): ChainJobResult {
	return receipt.status === 'success'
		? { status: 'CONFIRMED', txHash: hash }
		: failed(hash, 'transaction reverted')
}

function failed(txHash: Hex, error: string): ChainJobResult {
	return { status: 'FAILED', txHash, error }
}

function fakeAddress(seed: string) {
	return getAddress(`0x${keccakUtf8(seed).slice(-40)}`)
}

function usdc(value: unknown, name: string) {
	assert(
		typeof value === 'string' || typeof value === 'number',
		badRequest(`${name} must be a USDC decimal string`),
	)
	return parseUnits(String(value), USDC_DECIMALS)
}

function str(value: unknown, name: string) {
	assert(typeof value === 'string' && value, badRequest(`${name} is required`))
	return value
}
