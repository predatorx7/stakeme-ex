import { badRequest, conflict, isBoom } from '@hapi/boom'
import {
	creatorPoolAbi,
	deployments,
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
	encodeFunctionData,
	formatEther,
	formatUnits,
	getAddress,
	type Hex,
	http,
	isAddressEqual,
	type Log,
	parseEventLogs,
	parseUnits,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import {
	CHAIN_ID,
	CHAIN_NULLIFIER_SALT,
	CHAIN_RPC_URL,
	FACTORY_ADDRESS,
	ORACLE_PRIVATE_KEY,
	USDC_ADDRESS,
} from '../consts.ts'
import { LOGGER } from '../logger.ts'
import { mintCreatorEquityToken, simulateEquityToken } from './hedera-ats.ts'
import type { ChainJob, ChainJobResult } from './types.ts'
import { keccakUtf8, onchainNullifierHash } from './util.ts'

const USDC_DECIMALS = 6
const DEFAULT_TRANCHES = [2000, 4000, 4000]
// Hedera bills 80% of the gas limit, so limits are estimateGas + 20%, not a
// large default.
const GAS_MARGIN_PCT = 120n
// Hashio reads of a fresh contract fail with FAIL_INVALID until the mirror
// node indexes it.
const READ_TRIES = 10
const READ_DELAY_MS = 2000
// Hashio receipts can lag the mirror node by minutes.
const RECEIPT_WAIT = { timeout: 300_000, pollingInterval: 3000 }
const lastNonce = new Map<Address, number>()
const MIRROR_URL = process.env.HEDERA_MIRROR_URL
	|| 'https://testnet.mirrornode.hedera.com/api/v1'

export function isChainConfigured() {
	return !!CHAIN_RPC_URL
}

// ─── wallet funds ─────────────────────────────────────────────

/** A wallet's spendable balances. `UNAVAILABLE` never carries a number. */
export type WalletFunds =
	| { status: 'OK', usdc: string, hbar: string }
	| { status: 'UNAVAILABLE' }

const FUNDS_TTL_MS = 15_000
const FUNDS_FAIL_TTL_MS = 5_000
const fundsCache = new Map<string, { at: number, value: WalletFunds }>()

/** The MockUSDC token: `USDC_ADDRESS`, else the deployment for the chain. */
function usdcToken() {
	const address = USDC_ADDRESS || deployments[String(CHAIN_ID)]?.MockUSDC
	return address ? getAddress(address) : undefined
}

/** Whether the live chain's USDC has a public `faucet(to, amount)`. */
export function canRequestTestUsdc() {
	return isChainConfigured()
		&& !!usdcToken()
		&& !!ORACLE_PRIVATE_KEY
		&& mockUSDCAbi.some((e) => e.type === 'function' && e.name === 'faucet')
}

/**
 * Reads the wallet's MockUSDC and HBAR balances through the RPC (Hashio
 * retries like the job path). Cached 15 s per wallet. Simulated chain mode or
 * a failed read answers `UNAVAILABLE`: never a made-up number.
 */
export async function readWalletFunds(wallet: string): Promise<WalletFunds> {
	const token = usdcToken()
	if(!isChainConfigured() || !token) {
		return { status: 'UNAVAILABLE' }
	}

	const address = getAddress(wallet)
	const hit = fundsCache.get(address)
	if(hit && Date.now() - hit.at < (
		hit.value.status === 'OK' ? FUNDS_TTL_MS : FUNDS_FAIL_TTL_MS
	)) {
		return hit.value
	}

	let value: WalletFunds
	try {
		const client = createPublicClient({
			transport: http(CHAIN_RPC_URL, {
				retryCount: 3,
				retryDelay: 1000,
				timeout: 10_000,
			}),
		})
		const [usdc, hbar] = await Promise.all([
			retryFresh(() => client.readContract({
				address: token,
				abi: mockUSDCAbi,
				functionName: 'balanceOf',
				args: [address],
			})),
			retryFresh(() => client.getBalance({ address })),
		])
		value = {
			status: 'OK',
			usdc: formatUnits(usdc, USDC_DECIMALS),
			// The JSON-RPC relay reports HBAR in 18-decimal weibars.
			hbar: formatEther(hbar),
		}
	} catch(err) {
		LOGGER.warn({ err, wallet: address }, 'Wallet funds read failed')
		value = { status: 'UNAVAILABLE' }
	}

	fundsCache.set(address, { at: Date.now(), value })
	return value
}

/**
 * Mints `amount` test USDC to `wallet` through the token's public `faucet`.
 * The oracle key pays gas (it is the only signer in this process; it shares
 * the nonce tracker with the job path). Drops the wallet's cached balance.
 */
export async function requestTestUsdc(wallet: string, amount: string) {
	const token = usdcToken()
	assert(canRequestTestUsdc() && token, new Error('USDC faucet unavailable'))
	const account = privateKeyToAccount(ORACLE_PRIVATE_KEY as Hex)
	const transport = http(CHAIN_RPC_URL, {
		retryCount: 6,
		retryDelay: 1500,
		timeout: 60_000,
	})
	const publicClient = createPublicClient({ transport })
	const signer = createWalletClient({
		account,
		chain: defineChain({
			id: CHAIN_ID,
			name: `chain-${CHAIN_ID}`,
			nativeCurrency: { name: 'Native', symbol: 'ETH', decimals: 18 },
			rpcUrls: { default: { http: [CHAIN_RPC_URL] } },
		}),
		transport,
	})
	const call = {
		address: token,
		abi: mockUSDCAbi,
		functionName: 'faucet',
		args: [getAddress(wallet), parseUnits(amount, USDC_DECIMALS)],
	} as const
	await retryFresh(() => publicClient.simulateContract({ account, ...call }))
	const estimate = await retryFresh(() => publicClient.estimateGas({
		account,
		to: token,
		data: encodeFunctionData(call),
	}))
	const gas = (estimate * GAS_MARGIN_PCT) / 100n
	let hash: Hex
	for(let i = 1; ; i++) {
		const onchain = await publicClient.getTransactionCount({
			address: account.address,
		})
		const nonce = Math.max(onchain, (lastNonce.get(account.address) ?? -1) + 1)
		try {
			hash = await signer.writeContract({ ...call, gas, nonce })
			lastNonce.set(account.address, nonce)
			break
		} catch(err) {
			if(i >= READ_TRIES || !/nonce/i.test(String(err))) {
				throw err
			}

			await sleep(READ_DELAY_MS)
		}
	}

	const receipt = await publicClient.waitForTransactionReceipt({
		hash,
		timeout: 90_000,
		pollingInterval: 3000,
	})
	assert(receipt.status === 'success', new Error('Faucet transaction reverted'))
	fundsCache.delete(getAddress(wallet))
	return hash
}

// ─── user-signed trades ───────────────────────────────────────
// Live chain mode: the user's wallet signs approve + swap/invest, the server
// only reads the chain and verifies receipts. No signer key is used here.

const POOL_TOKENS_TTL_MS = 3_600_000
const poolTokens = new Map<
	string,
	{ usdc: Address, token: Address, at: number }
>()
let readClientCache: ReturnType<typeof newReadClient> | undefined

function newReadClient() {
	return createPublicClient({
		transport: http(CHAIN_RPC_URL, {
			retryCount: 6,
			retryDelay: 1500,
			timeout: 30_000,
		}),
	})
}

function readClient() {
	readClientCache ||= newReadClient()
	return readClientCache
}

/** Live reserves of a CreatorPool, in base units (USDC 6 dp, token 18 dp). */
export async function getPoolReserves(pool: string) {
	const [usdcReserve, tokenReserve] = await retryFresh(() => (
		readClient().readContract({
			address: getAddress(pool),
			abi: creatorPoolAbi,
			functionName: 'getReserves',
		})
	))
	return { usdcReserve, tokenReserve }
}

/** Tokens out (base units) for `usdcIn` USDC base units, per the pool. */
export function quoteBuy(pool: string, usdcIn: bigint) {
	return retryFresh(() => readClient().readContract({
		address: getAddress(pool),
		abi: creatorPoolAbi,
		functionName: 'quoteBuy',
		args: [usdcIn],
	}))
}

/** USDC out (base units) for `tokenIn` token base units, per the pool. */
export function quoteSell(pool: string, tokenIn: bigint) {
	return retryFresh(() => readClient().readContract({
		address: getAddress(pool),
		abi: creatorPoolAbi,
		functionName: 'quoteSell',
		args: [tokenIn],
	}))
}

/** Whether the pool is seeded and its ISA allows trading right now. */
export function isPoolTradingOpen(pool: string) {
	return retryFresh(() => readClient().readContract({
		address: getAddress(pool),
		abi: creatorPoolAbi,
		functionName: 'tradingOpen',
	}))
}

/** The factory's pool clone for an ISA; `undefined` when none (old factory). */
export async function readPoolOf(factory: string, isa: string) {
	try {
		const pool = await retryFresh(() => readClient().readContract({
			address: getAddress(factory),
			abi: liquidISAFactoryAbi,
			functionName: 'poolOf',
			args: [getAddress(isa)],
		}))
		return /^0x0*$/.test(pool) ? undefined : pool
	} catch(err) {
		LOGGER.warn({ err, isa }, 'poolOf read failed')
		return undefined
	}
}

/** The pool's USDC and share token, read once per hour per pool. */
export async function readPoolTokens(pool: Address) {
	const hit = poolTokens.get(pool)
	if(hit && Date.now() - hit.at < POOL_TOKENS_TTL_MS) {
		return hit
	}

	const read = (functionName: 'usdc' | 'token') => retryFresh(() => (
		readClient().readContract({
			address: pool,
			abi: creatorPoolAbi,
			functionName,
		})
	))
	const [usdc, token] = await Promise.all([read('usdc'), read('token')])
	const value = { usdc, token, at: Date.now() }
	poolTokens.set(pool, value)
	return value
}

type ReceiptLike = {
	status: string
	to: string | null
	from: string
	logs: readonly Log[]
}

/**
 * Pure: the receipt must be a success, sent by `from` to the contract `to`.
 * Returns the logs. Everything else (events) is decoded from these logs only
 * when they were emitted by the expected contracts.
 */
export function checkReceipt(
	receipt: ReceiptLike,
	expected: { to: string, from: string },
) {
	assert(
		receipt.status === 'success',
		conflict('The transaction failed onchain'),
	)
	assert(
		!!receipt.to
			&& isAddressEqual(getAddress(receipt.to), getAddress(expected.to)),
		conflict('The transaction was sent to a different contract'),
	)
	assert(
		isAddressEqual(getAddress(receipt.from), getAddress(expected.from)),
		conflict('The transaction was sent by a different wallet'),
	)
	return receipt.logs
}

/**
 * Fetches a user transaction's receipt (waits and retries while Hashio or the
 * mirror node lags) and checks status, sender and target. Returns its logs.
 */
export async function verifyUserTx(
	txHash: string,
	expected: { to: string, from: string },
) {
	try {
		const receipt = await readClient().waitForTransactionReceipt({
			hash: txHash as Hex,
			timeout: 90_000,
			pollingInterval: 3000,
		})
		return checkReceipt(receipt, expected)
	} catch(err) {
		// A rejected check (boom) is a final answer; only lookups are retried.
		if(isBoom(err)) {
			throw err
		}

		LOGGER.warn({ err, txHash }, 'Receipt lookup failed')
		throw conflict('Transaction not found or not confirmed yet. Try again.')
	}
}

function fromContract(logs: readonly Log[], address: string) {
	const want = getAddress(address)
	return logs.filter((l) => isAddressEqual(getAddress(l.address), want))
}

/** Whether `logs` hold an ERC-20 `Transfer(from, to, value)` from `token`. */
function hasTransfer(
	logs: readonly Log[],
	token: Address,
	move: { from: Address, to: Address, value: bigint },
) {
	return parseEventLogs({
		abi: mockUSDCAbi,
		eventName: 'Transfer',
		logs: fromContract(logs, token),
	}).some((t) => (
		isAddressEqual(t.args.from, move.from)
		&& isAddressEqual(t.args.to, move.to)
		&& t.args.value === move.value
	))
}

/**
 * Decodes the pool `Swap` of a verified swap receipt. Checks the trader and
 * that the output Transfer reached the trader (the swap's `to` must be the
 * trader, or the holdings credit would be wrong). Amounts are base units.
 */
export async function decodeSwapReceipt(
	logs: readonly Log[],
	{ pool, trader }: { pool: string, trader: string },
) {
	const poolAddress = getAddress(pool)
	const [swap] = parseEventLogs({
		abi: creatorPoolAbi,
		eventName: 'Swap',
		logs: fromContract(logs, poolAddress),
	})
	assert(swap, conflict('The transaction has no swap from this pool'))
	const s = swap.args
	assert(
		isAddressEqual(s.trader, getAddress(trader)),
		conflict('The swap was made by a different wallet'),
	)
	const { usdc, token } = await readPoolTokens(poolAddress)
	const buy = s.tokenOut > 0n
	assert(
		buy
			? hasTransfer(logs, token, {
				from: poolAddress, to: s.trader, value: s.tokenOut,
			})
			: hasTransfer(logs, usdc, {
				from: poolAddress, to: s.trader, value: s.usdcOut,
			}),
		conflict('The swap output did not go to your wallet'),
	)
	return {
		usdcIn: s.usdcIn,
		tokenIn: s.tokenIn,
		usdcOut: s.usdcOut,
		tokenOut: s.tokenOut,
		usdcReserve: s.usdcReserve,
		tokenReserve: s.tokenReserve,
	}
}

/**
 * Decodes the ISA `Invested` event of a verified invest receipt. `raiseClosed`
 * is true with `RaiseClosed` in the same receipt, then `seeded` holds the
 * pool's `Seeded` reserves. Amounts are base units.
 */
export function decodeInvestReceipt(
	logs: readonly Log[],
	{ isa, pool, investor }: {
		isa: string
		pool?: string | null
		investor: string
	},
) {
	const own = fromContract(logs, isa)
	const [invested] = parseEventLogs({
		abi: liquidISAAbi, eventName: 'Invested', logs: own,
	})
	assert(invested, conflict('The transaction has no investment in this raise'))
	assert(
		isAddressEqual(invested.args.investor, getAddress(investor)),
		conflict('The investment was made by a different wallet'),
	)
	const raiseClosed = parseEventLogs({
		abi: liquidISAAbi, eventName: 'RaiseClosed', logs: own,
	}).length > 0
	const [seed] = pool
		? parseEventLogs({
			abi: creatorPoolAbi,
			eventName: 'Seeded',
			logs: fromContract(logs, pool),
		})
		: []
	return {
		usdc: invested.args.usdcAmount,
		shares: invested.args.shares,
		raiseClosed,
		seeded: seed
			? { usdc: seed.args.usdcAmount, tokens: seed.args.tokenAmount }
			: undefined,
	}
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

	if(job.fn === 'closeRaise' || job.fn === 'reclaimStake') {
		try {
			return await settleCreatorOnlyJob(job, job.fn)
		} catch(err) {
			// A read failure never reached the chain; the worker requeues it.
			const error = describeError(err)
			LOGGER.error({ err, job: job.id, fn: job.fn }, 'Chain read failed')
			return { status: 'FAILED', txHash: null, error }
		}
	}

	try {
		return await sendReal(job)
	} catch(err) {
		const error = describeError(err)
		LOGGER.error({ err, job: job.id, fn: job.fn }, 'Chain job failed')
		return { status: 'FAILED', txHash: null, error }
	}
}

/**
 * `closeRaise` and `reclaimStake` are creator-only onchain: the oracle can't
 * sign them. The creator signs `closeRaise` in their wallet (the server
 * verifies it), and `reclaimStake` is theirs to call. The job never sends and
 * never retries: it is CONFIRMED when the chain already shows the effect, else
 * SIMULATED (terminal, doesn't block later jobs) with a note.
 */
async function settleCreatorOnlyJob(
	job: ChainJob,
	fn: 'closeRaise' | 'reclaimStake',
): Promise<ChainJobResult> {
	assert(job.contractAddress, badRequest(`${job.fn} needs a contract address`))
	const isa = getAddress(job.contractAddress)
	const functionName = fn === 'closeRaise'
		? 'raiseClosed'
		: 'stakeReclaimed'
	const done = await retryFresh(() => readClient().readContract({
		address: isa, abi: liquidISAAbi, functionName,
	}))
	return done
		? { status: 'CONFIRMED', txHash: null }
		: {
			status: 'SIMULATED',
			txHash: null,
			error: AWAITING_CREATOR_NOTE[fn],
		}
}

const AWAITING_CREATOR_NOTE = {
	closeRaise: 'Awaiting creator signature: close the raise in your wallet.',
	reclaimStake:
		'Awaiting creator signature: reclaim your stake in your wallet.',
} as const

/** Pure: deterministic fake receipt (hash = keccak256 of the job id). */
export function simulateChainJob(job: ChainJob): ChainJobResult {
	const txHash = keccakUtf8(job.id)
	const result: ChainJobResult = { status: 'SIMULATED', txHash }
	if(job.fn === 'createISA') {
		result.deployed = {
			isa: fakeAddress(`isa:${job.id}`),
			token: fakeAddress(`token:${job.id}`),
			atsToken: simulateEquityToken(atsInput(job, fakeAddress(`isa:${job.id}`)))
				.evmAddress,
		}
	}

	return result
}

async function sendReal(job: ChainJob): Promise<ChainJobResult> {
	assert(ORACLE_PRIVATE_KEY, new Error('ORACLE_PRIVATE_KEY is not set'))
	const account = privateKeyToAccount(ORACLE_PRIVATE_KEY as Hex)
	// Hashio (Hedera's public relay) answers 502s and times out under load.
	// Retrying is safe even for eth_sendRawTransaction: the same signed tx
	// has one nonce, so a duplicate is rejected rather than executed twice.
	const transport = http(CHAIN_RPC_URL, {
		retryCount: 6,
		retryDelay: 1500,
		timeout: 60_000,
	})
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
		await retryFresh(() => publicClient.simulateContract({
			account,
			...call,
		}))
		const hash = await write({ ...call, gas: await gasFor(call) })
		const receipt = await publicClient.waitForTransactionReceipt({
			hash,
			...RECEIPT_WAIT,
		})
		return { hash, receipt }
	}

	/**
	 * Hashio's nonce view lags behind confirmed txs (the mirror node), so a
	 * quick second tx can get "nonce too low". Track the next nonce locally
	 * and retry that error.
	 */
	async function write(call: {
		address: Address
		abi: Abi
		functionName: string
		args?: readonly unknown[]
		gas: bigint
	}) {
		for(let i = 1; ; i++) {
			const onchain = await publicClient.getTransactionCount({
				address: account.address,
			})
			const nonce = Math.max(
				onchain,
				(lastNonce.get(account.address) ?? -1) + 1,
			)
			try {
				const hash = await wallet.writeContract({ ...call, nonce })
				lastNonce.set(account.address, nonce)
				return hash
			} catch(err) {
				if(i >= READ_TRIES || !/nonce/i.test(String(err))) {
					throw err
				}

				await sleep(READ_DELAY_MS)
			}
		}
	}

	/** estimateGas + 20%, retrying FAIL_INVALID on a fresh target. */
	async function gasFor(request: {
		address: Address
		abi: Abi
		functionName: string
		args?: readonly unknown[]
	}) {
		const data = encodeFunctionData(request)
		const estimate = await retryFresh(() => publicClient.estimateGas({
			account,
			to: request.address,
			data,
		}))
		return (estimate * GAS_MARGIN_PCT) / 100n
	}

	switch (job.fn) {
		case 'createISA': {
			const nullHash = typeof args.worldIdNullifierHash === 'string'
				? args.worldIdNullifierHash as Hex
				: onchainNullifierHash(
					str(args.worldIdNullifier, 'worldIdNullifier'),
					CHAIN_NULLIFIER_SALT,
				)
			const given = Array.isArray(args.trancheBps) ? args.trancheBps : []
			const trancheBps = given.length ? given.map(Number) : DEFAULT_TRANCHES
			const { hash, receipt } = await send({
				address: to,
				abi: liquidISAFactoryAbi,
				functionName: 'createISA',
				// `launch_ipo` (SQL) sends ticker, targetRaise and stakeAmount; the
				// older names stay accepted for direct callers and tests.
				args: [
					str(
						args.name ?? `${str(args.ticker, 'ticker')} Creator Share`,
						'name',
					),
					str(args.ticker, 'ticker'),
					usdc(args.totalRaise ?? args.targetRaise, 'totalRaise'),
					usdc(
						args.creatorStake ?? args.stakeAmount ?? '0',
						'creatorStake',
					),
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
			await waitForMirror(created.args.isa)
			const poolCreated = parseEventLogs({
				abi: liquidISAFactoryAbi,
				eventName: 'PoolCreated',
				logs: receipt.logs,
			})[0]?.args.pool
			const pool = await readPoolOf(to, created.args.isa) || poolCreated
			const atsToken = await mirrorAtsToken(created.args.isa)
			return {
				status: 'CONFIRMED',
				txHash: hash,
				deployed: {
					isa: created.args.isa,
					token: created.args.token,
					atsToken,
					pool,
				},
			}
		}

		case 'initializeIPO': {
			const stake = await retryFresh(() => publicClient.readContract({
				address: to,
				abi: liquidISAAbi,
				functionName: 'creatorStake',
			}))
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
		case 'freezeEscrow':
		case 'unfreezeEscrow':
			return finish(await send({
				address: to, abi: liquidISAAbi, functionName: job.fn,
			}))

		case 'closeRaise':
		case 'reclaimStake':
			throw new Error(`${job.fn} is creator-only`)
	}

	/**
	 * Mints the Hedera ATS equity token for a new ISA and records it onchain.
	 * Never fails the job: the ISA works without the ATS mirror.
	 */
	async function mirrorAtsToken(isa: Address) {
		const ats = await mintCreatorEquityToken(atsInput(job, account.address))
		if(ats.status !== 'CONFIRMED') {
			return ats.evmAddress
		}

		try {
			await send({
				address: isa,
				abi: liquidISAAbi,
				functionName: 'setAtsToken',
				args: [getAddress(ats.evmAddress)],
			})
		} catch(err) {
			LOGGER.warn({ err, isa }, 'setAtsToken failed')
		}

		return ats.evmAddress
	}

	/** Mint (MockUSDC only) and approve `amount` of the ISA's USDC. */
	async function fundAndApprove(isa: Address, amount: bigint) {
		if(amount === 0n) {
			return
		}

		const token = await retryFresh(() => publicClient.readContract({
			address: isa, abi: liquidISAAbi, functionName: 'usdc',
		}))
		const balance = await retryFresh(() => publicClient.readContract({
			address: token,
			abi: mockUSDCAbi,
			functionName: 'balanceOf',
			args: [account.address],
		}))
		if(balance < amount) {
			try {
				const mint = await write({
					address: token,
					abi: mockUSDCAbi,
					functionName: 'mint',
					args: [account.address, amount - balance],
					gas: await gasFor({
						address: token,
						abi: mockUSDCAbi,
						functionName: 'mint',
						args: [account.address, amount - balance],
					}),
				})
				await publicClient.waitForTransactionReceipt({
					hash: mint,
					...RECEIPT_WAIT,
				})
			} catch(err) {
				// Real USDC has no open mint: the oracle must already hold it.
				LOGGER.warn({ err }, 'USDC mint skipped')
			}
		}

		const approve = await write({
			address: token,
			abi: mockUSDCAbi,
			functionName: 'approve',
			args: [isa, amount],
			gas: await gasFor({
				address: token,
				abi: mockUSDCAbi,
				functionName: 'approve',
				args: [isa, amount],
			}),
		})
		await publicClient.waitForTransactionReceipt({
			hash: approve,
			...RECEIPT_WAIT,
		})
	}
}

/**
 * Retries a call while Hashio answers FAIL_INVALID (the contract is not in
 * the mirror node yet). Other errors rethrow immediately.
 */
async function retryFresh<T>(fn: () => Promise<T>): Promise<T> {
	for(let i = 1; ; i++) {
		try {
			return await fn()
		} catch(err) {
			if(i >= READ_TRIES || !isFailInvalid(err)) {
				throw err
			}

			await sleep(READ_DELAY_MS)
		}
	}
}

function isFailInvalid(err: unknown) {
	const text = err instanceof BaseError
		? `${err.message} ${err.details}`
		: String(err)
	return /FAIL_INVALID/i.test(text)
}

/** Waits until the Hedera mirror node knows `address` (skipped elsewhere). */
async function waitForMirror(address: Address) {
	if(CHAIN_ID && CHAIN_ID !== 296) {
		return
	}

	for(let i = 0; i < 30; i++) {
		const res = await fetch(`${MIRROR_URL}/contracts/${address}`)
			.catch(() => null)
		if(res?.ok) {
			return
		}

		await sleep(READ_DELAY_MS)
	}

	LOGGER.warn({ address }, 'Mirror node did not index contract in time')
}

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

/** ATS mint input from a `createISA` job (1 USDC raised = 1 share). */
function atsInput(job: ChainJob, holder: string) {
	const { args } = job
	return {
		ticker: String(args.ticker ?? ''),
		name: String(args.name ?? ''),
		supply: String(args.totalRaise ?? '0').split('.')[0],
		decimals: 18,
		holder,
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
