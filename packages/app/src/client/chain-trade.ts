/// <reference lib="dom" />
import { showToast } from '@reclaimprotocol/design/behaviors'
import { creatorPoolAbi, liquidISAAbi, mockUSDCAbi } from '@stakeme/contracts'
import {
	type Abi,
	type Address,
	BaseError,
	type Chain,
	ContractFunctionRevertedError,
	createPublicClient,
	defineChain,
	encodeFunctionData,
	formatUnits,
	getAddress,
	http,
	parseUnits,
	UserRejectedRequestError,
	type WalletClient,
} from 'viem'
import { readSlippage } from './order-estimate.ts'
import { pick, postJson, toastError } from './web3-util.ts'

/**
 * User-signed trades and investments (live chain mode). Delegated, no
 * framework. Intercepts the submit of:
 *
 *   [data-order-ticket] form        BUY / SELL against the creator's pool
 *   form[action$="/investments"]    primary-market invest
 *   form[action$="/close-raise"]    creator ends the raise (`closeRaise`)
 *
 * `GET /creators/{ticker}/chain` says whether the creator trades onchain. When
 * `simulated` the form goes to the server untouched (SQL pool path). When
 * `live` the wallet that signed in sends `approve` (skipped when the
 * allowance is enough) and then the swap or `invest` call (gas = estimate
 * + 20%, slippage as `minOut`), and the `txHash` is posted to the same route;
 * the server verifies the receipt and records the exact event amounts.
 *
 * A "Get 1,000 test USDC" button (`MockUSDC.faucet`, signed by the user)
 * appears when the USDC balance is low; a wallet without HBAR for gas gets a
 * link to the Hedera testnet faucet.
 */

type ChainInfo =
	| { mode: 'simulated' }
	| {
		mode: 'live'
		chainId: number
		rpcUrl: string
		isa: Address
		token: Address
		pool: Address
		usdc: Address
	}
type Live = Extract<ChainInfo, { mode: 'live' }>

type Job =
	| { kind: 'trade', form: HTMLFormElement, root: HTMLElement, ticker: string }
	| { kind: 'invest', form: HTMLFormElement, root: HTMLElement, ticker: string }
	| { kind: 'close', form: HTMLFormElement, root: HTMLElement, ticker: string }

const USDC_DECIMALS = 6
const TOKEN_DECIMALS = 18
const FAUCET_AMOUNT = 1000n
const LOW_USDC = 1n * 10n ** 6n
const GAS_MARGIN_PCT = 120n
const HBAR_FAUCET = 'https://portal.hedera.com/faucet'
const NO_HBAR = 'Your wallet needs testnet HBAR for gas.'
const NO_USDC = 'You need test USDC for this order.'
const RETRY_TRIES = 6
const RETRY_DELAY_MS = 2000

const infos = new Map<string, Promise<ChainInfo>>()

document.addEventListener('submit', (event) => {
	const form = event.target
	if(!(form instanceof HTMLFormElement) || form.dataset.chainBypass) {
		return
	}

	const job = classify(form)
	if(!job) {
		return
	}

	// Capture phase: runs before htmx sees the submit.
	event.preventDefault()
	event.stopImmediatePropagation()
	void run(job)
})

document.addEventListener('click', (event) => {
	const button = (event.target as Element | null)
		?.closest<HTMLButtonElement>('[data-chain-faucet]')
	if(!button || button.disabled) {
		return
	}

	const host = button.closest<HTMLElement>('[data-chain-scope]')
	const ticker = host?.dataset.chainScope
	if(!host || !ticker) {
		return
	}

	event.preventDefault()
	void getFaucet(host, button, ticker)
})

document.addEventListener('click', (event) => {
	const button = (event.target as Element | null)
		?.closest<HTMLButtonElement>('[data-chain-dividend], [data-chain-claim]')
	const ticker = button?.dataset.ticker ?? button?.dataset.chainClaim
	if(!button || button.disabled || !ticker) {
		return
	}

	event.preventDefault()
	void (button.dataset.chainDividend
		? payDividend(button, ticker)
		: claimDividends(button, ticker))
})

document.addEventListener('htmx:load', paintAll)
paintAll()

function classify(form: HTMLFormElement): Job | undefined {
	const root = form.closest<HTMLElement>('[data-order-ticket]')
	if(root?.dataset.ticker) {
		return { kind: 'trade', form, root, ticker: root.dataset.ticker }
	}

	const m = /^\/creators\/([A-Z]{3,6})\/(investments|close-raise)$/.exec(
		new URL(form.action, location.href).pathname,
	)
	return m
		? {
			kind: m[2] === 'investments' ? 'invest' : 'close',
			form,
			root: form,
			ticker: m[1],
		}
		: undefined
}

function chainInfo(ticker: string) {
	let info = infos.get(ticker)
	if(!info) {
		info = fetch(`/creators/${encodeURIComponent(ticker)}/chain`, {
			credentials: 'same-origin',
			headers: { accept: 'application/json' },
		}).then(async(res) => {
			if(!res.ok) {
				throw new Error('Could not load the chain settings. Try again.')
			}

			return await res.json() as ChainInfo
		})
		// A failed lookup must not stick.
		info.catch(() => infos.delete(ticker))
		infos.set(ticker, info)
	}

	return info
}

async function run(job: Job) {
	const { form, ticker } = job
	const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')
	try {
		const info = await chainInfo(ticker)
		if(info.mode !== 'live') {
			// SQL pool path: let htmx submit as usual.
			form.dataset.chainBypass = '1'
			form.requestSubmit(submit)
			delete form.dataset.chainBypass
			return
		}

		if(submit) {
			submit.disabled = true
			submit.setAttribute('aria-busy', 'true')
		}

		clearNotice(form)
		await (job.kind === 'trade'
			? trade(job, info)
			: job.kind === 'invest'
				? invest(job, info)
				: closeRaise(job, info))
	} catch(err) {
		fail(job, err)
	} finally {
		status(form, '')
		if(submit) {
			submit.disabled = form.closest<HTMLElement>(
				'[data-order-ticket]',
			)?.dataset.halted === 'true'
			submit.removeAttribute('aria-busy')
		}
	}
}

// ── flows ──────────────────────────────────────────────────────────────

async function trade(job: Job, info: Live) {
	const { form, root, ticker } = job
	const side = form.querySelector<HTMLInputElement>(
		'input[name="side"]:checked',
	)?.value === 'SELL'
		? 'SELL'
		: 'BUY'
	const buy = side === 'BUY'
	const amount = parseAmount(
		form.querySelector<HTMLInputElement>('input[name="amountIn"]')?.value,
		buy ? USDC_DECIMALS : TOKEN_DECIMALS,
	)
	const slippage = readSlippage(root)
	if(slippage.invalid) {
		throw new Error('Slippage must be between 0.01% and 50%.')
	}

	const ctx = await context(form, info)
	const asset = buy ? info.usdc : info.token
	if(!await ctx.pub.readContract({
		address: info.pool, abi: creatorPoolAbi, functionName: 'tradingOpen',
	})) {
		throw new Error('Trading is halted for this creator right now.')
	}

	const have = await ctx.pub.readContract({
		address: asset,
		abi: mockUSDCAbi,
		functionName: 'balanceOf',
		args: [ctx.address],
	})
	if(have < amount) {
		if(buy) {
			needUsdc(form, ticker)
		}

		throw new Error(buy ? NO_USDC : 'You do not hold that many tokens.')
	}

	const quote = await ctx.pub.readContract({
		address: info.pool,
		abi: creatorPoolAbi,
		functionName: buy ? 'quoteBuy' : 'quoteSell',
		args: [amount],
	})
	if(quote === 0n) {
		throw new Error('Amount is too small to trade.')
	}

	const minOut = quote * BigInt(10_000 - slippage.bps) / 10_000n
	await approve(ctx, asset, info.pool, amount, buy ? 'USDC' : ticker)
	const hash = await send(ctx, {
		address: info.pool,
		abi: creatorPoolAbi,
		functionName: buy ? 'swapExactUsdcForTokens' : 'swapExactTokensForUsdc',
		args: [amount, minOut, ctx.address],
	}, buy ? `buy ${ticker}` : `sell ${ticker}`)
	await record(form, `/creators/${ticker}/trades`, hash, 'smx:traded')
}

async function invest(job: Job, info: Live) {
	const { form, ticker } = job
	const amount = parseAmount(
		form.querySelector<HTMLInputElement>('input[name="usdcAmount"]')?.value,
		USDC_DECIMALS,
	)
	const ctx = await context(form, info)
	const have = await ctx.pub.readContract({
		address: info.usdc,
		abi: mockUSDCAbi,
		functionName: 'balanceOf',
		args: [ctx.address],
	})
	if(have < amount) {
		needUsdc(form, ticker)
		throw new Error(NO_USDC)
	}

	await approve(ctx, info.usdc, info.isa, amount, 'USDC')
	const hash = await send(ctx, {
		address: info.isa,
		abi: liquidISAAbi,
		functionName: 'invest',
		args: [amount],
	}, 'investment')
	await record(form, `/creators/${ticker}/investments`, hash, 'smx:invested')
}

async function closeRaise(job: Job, info: Live) {
	const { form, ticker } = job
	const ctx = await context(form, info)
	const hash = await send(ctx, {
		address: info.isa,
		abi: liquidISAAbi,
		functionName: 'closeRaise',
		args: [],
	}, 'close raise')
	const url = `/creators/${ticker}/close-raise`
	await record(form, url, hash, 'smx:raise-closed')
}

/**
 * Creator pays a dividend in USDC: approve (if short), `distributeDividend`,
 * then the hash goes to `POST /dividends/{id}/payment`.
 */
async function payDividend(button: HTMLButtonElement, ticker: string) {
	const scope = button.closest<HTMLElement>('[data-chain-dividend-scope]')
		?? button.parentElement!
	const out = scope.querySelector<HTMLElement>('[data-chain-dividend-status]')
	await withButton(button, scope, ticker, async(info) => {
		const amount = parseAmount(button.dataset.amount, USDC_DECIMALS)
		const ctx = await context(scope, info)
		const have = await ctx.pub.readContract({
			address: info.usdc,
			abi: mockUSDCAbi,
			functionName: 'balanceOf',
			args: [ctx.address],
		})
		if(have < amount) {
			needUsdc(scope, ticker)
			throw new Error('You need more test USDC to pay this dividend.')
		}

		await approve(ctx, info.usdc, info.isa, amount, 'USDC')
		const hash = await send(ctx, {
			address: info.isa,
			abi: liquidISAAbi,
			functionName: 'distributeDividend',
			args: [amount],
		}, 'dividend payment')
		status(scope, 'Recording your payment...')
		let paid: unknown
		try {
			({ json: paid } = await postJson(
				`/dividends/${button.dataset.chainDividend}/payment`,
				{ txHash: hash },
			))
		} catch(err) {
			const why = err instanceof Error ? err.message : String(err)
			throw new Error(
				`Your payment confirmed (${hash.slice(0, 10)}…) but recording it `
				+ `failed: ${why} Reload to see it.`,
			)
		}

		const holders = pick(pick(paid, 'settlement'), 'holders')
		const who = typeof holders === 'number'
			? `${holders} holder${holders === 1 ? '' : 's'}`
			: 'holders'
		if(out) {
			out.replaceChildren(
				`Paid in USDC to ${who}. They claim it from Portfolio. `,
			)
			const link = document.createElement('a')
			const net = hashscanNetwork(info.chainId)
			link.href = `https://hashscan.io/${net}/transaction/${hash}`
			link.target = '_blank'
			link.rel = 'noopener noreferrer'
			link.textContent = 'View on HashScan'
			out.append(link)
		}

		button.hidden = true
		document.body.dispatchEvent(
			new CustomEvent('smx:dividend-paid', { bubbles: true }),
		)
	})
}

/** Holder claims their USDC dividends, then the hash goes to the server. */
async function claimDividends(button: HTMLButtonElement, ticker: string) {
	const scope = button.closest<HTMLElement>('[data-chain-claim-scope]')
		?? button.parentElement!
	await withButton(button, scope, ticker, async(info) => {
		const ctx = await context(scope, info)
		const hash = await send(ctx, {
			address: info.isa,
			abi: liquidISAAbi,
			functionName: 'claim',
			args: [],
		}, 'claim')
		status(scope, 'Recording your claim...')
		try {
			await postJson('/portfolio/claims', { ticker, txHash: hash })
		} catch(err) {
			const why = err instanceof Error ? err.message : String(err)
			throw new Error(
				`Your claim confirmed (${hash.slice(0, 10)}…) but recording it `
				+ `failed: ${why} Reload to see it.`,
			)
		}

		showToast('USDC claimed.', { tone: 'success' })
		location.reload()
	})
}

/** Runs a live-chain button action with busy state and error handling. */
async function withButton(
	button: HTMLButtonElement,
	scope: HTMLElement,
	ticker: string,
	action: (info: Live) => Promise<void>,
) {
	button.disabled = true
	button.setAttribute('aria-busy', 'true')
	try {
		const info = await chainInfo(ticker)
		if(info.mode !== 'live') {
			throw new Error('This creator does not pay dividends onchain.')
		}

		clearNotice(scope)
		await action(info)
	} catch(err) {
		fail({ form: scope, ticker }, err)
	} finally {
		status(scope, '')
		button.disabled = false
		button.removeAttribute('aria-busy')
	}
}

function hashscanNetwork(chainId: number) {
	return chainId === 295 ? 'mainnet' : 'testnet'
}

async function getFaucet(
	host: HTMLElement,
	button: HTMLButtonElement,
	ticker: string,
) {
	const form = host.closest('form') ?? host
	button.disabled = true
	button.setAttribute('aria-busy', 'true')
	try {
		const info = await chainInfo(ticker)
		if(info.mode !== 'live') {
			return
		}

		const ctx = await context(form, info)
		await send(ctx, {
			address: info.usdc,
			abi: mockUSDCAbi,
			functionName: 'faucet',
			args: [ctx.address, FAUCET_AMOUNT * 10n ** BigInt(USDC_DECIMALS)],
		}, 'test USDC')
		clearNotice(form)
		showToast('1,000 test USDC added to your wallet.', { tone: 'success' })
	} catch(err) {
		fail({ form, ticker }, err)
	} finally {
		status(form, '')
		button.disabled = false
		button.removeAttribute('aria-busy')
	}
}

/** Posts the confirmed hash; the server verifies and indexes it. */
async function record(
	form: HTMLFormElement,
	url: string,
	txHash: string,
	trigger: string,
) {
	status(form, 'Recording your order...')
	try {
		await postJson(url, { txHash })
	} catch(err) {
		const why = err instanceof Error ? err.message : String(err)
		throw new Error(
			`Your transaction confirmed (${txHash.slice(0, 10)}…) but recording it `
			+ `failed: ${why} Reload to see it.`,
		)
	}

	form.reset()
	document.body.dispatchEvent(new CustomEvent(trigger, { bubbles: true }))
}

// ── chain plumbing ─────────────────────────────────────────────────────

type Ctx = Awaited<ReturnType<typeof context>>

async function context(form: HTMLElement, info: Live) {
	if(!window.smxWallet) {
		throw new Error('Wallet is not ready. Reload the page.')
	}

	const chain = defineChain({
		id: info.chainId,
		name: `chain-${info.chainId}`,
		nativeCurrency: { name: 'HBAR', symbol: 'HBAR', decimals: 18 },
		rpcUrls: { default: { http: [info.rpcUrl] } },
	})
	status(form, 'Connecting your wallet...')
	const wallet = await window.smxWallet.current()
	const client = wallet.txClient(chain, info.rpcUrl)
	await ensureChain(client, chain)
	return {
		chain,
		client,
		address: wallet.address,
		form,
		pub: createPublicClient({
			chain,
			transport: http(info.rpcUrl, { retryCount: 4, retryDelay: 1500 }),
		}),
	}
}

/** Asks an injected wallet to switch to the app's chain, adding it if new. */
async function ensureChain(client: WalletClient, chain: Chain) {
	if(await client.getChainId() === chain.id) {
		return
	}

	try {
		await client.switchChain({ id: chain.id })
	} catch{
		try {
			await client.addChain({ chain })
			await client.switchChain({ id: chain.id })
		} catch{
			throw new Error(`Switch your wallet to ${chain.name} and try again.`)
		}
	}
}

/** Approves exactly `amount` unless the allowance already covers it. */
async function approve(
	ctx: Ctx,
	token: Address,
	spender: Address,
	amount: bigint,
	label: string,
) {
	const allowance = await ctx.pub.readContract({
		address: token,
		abi: mockUSDCAbi,
		functionName: 'allowance',
		args: [ctx.address, spender],
	})
	if(allowance >= amount) {
		return
	}

	await send(ctx, {
		address: token,
		abi: mockUSDCAbi,
		functionName: 'approve',
		args: [spender, amount],
	}, `${label} approval`)
}

/**
 * Simulates (for readable revert reasons), sets gas to the estimate + 20%,
 * checks the wallet can pay for it, signs, and waits for the receipt.
 */
async function send(
	ctx: Ctx,
	call: {
		address: Address
		abi: Abi
		functionName: string
		args: readonly unknown[]
	},
	label: string,
) {
	const { pub, client, address, chain, form } = ctx
	// Hashio state lags a block behind a just-mined approve.
	await retry(() => pub.simulateContract({ account: address, ...call }))
	const estimate = await pub.estimateGas({
		account: address,
		to: call.address,
		data: encodeFunctionData(call),
	})
	const gas = estimate * GAS_MARGIN_PCT / 100n
	const [balance, price] = await Promise.all([
		pub.getBalance({ address }),
		pub.getGasPrice(),
	])
	if(balance < gas * price) {
		throw new Error(NO_HBAR)
	}

	status(form, `Confirm the ${label} in your wallet...`)
	const hash = await retry(() => client.writeContract({
		...call,
		account: address,
		chain,
		gas,
	}))
	status(form, `Waiting for the ${label} to confirm...`)
	const receipt = await pub.waitForTransactionReceipt({
		hash,
		timeout: 300_000,
		pollingInterval: 3000,
	})
	if(receipt.status !== 'success') {
		throw new Error(`The ${label} failed onchain.`)
	}

	return hash
}

/** Retries Hashio's stale-state errors (nonce, allowance not visible yet). */
async function retry<T>(fn: () => Promise<T>): Promise<T> {
	for(let i = 1; ; i++) {
		try {
			return await fn()
		} catch(err) {
			const stale = /nonce|allowance|FAIL_INVALID/i.test(String(err))
			if(i >= RETRY_TRIES || !stale || isRejection(err)) {
				throw err
			}

			await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
		}
	}
}

function parseAmount(value: string | undefined, decimals: number) {
	const text = value?.trim() ?? ''
	if(!/^\d+(\.\d+)?$/.test(text)) {
		throw new Error('Enter a valid amount.')
	}

	if((text.split('.')[1]?.length ?? 0) > decimals) {
		throw new Error(`Use at most ${decimals} decimal places.`)
	}

	const amount = parseUnits(text, decimals)
	if(amount <= 0n) {
		throw new Error('Enter a valid amount.')
	}

	return amount
}

// ── messages ───────────────────────────────────────────────────────────

function isRejection(err: unknown) {
	return err instanceof BaseError
		&& (
			!!err.walk((e) => e instanceof UserRejectedRequestError)
			|| /user (rejected|denied)|rejected the request|ACTION_REJECTED/i
				.test(`${err.shortMessage} ${err.message}`)
		)
}

const REVERTS: Record<string, string> = {
	Slippage:
		'The price moved past your slippage limit. Raise the slippage or retry.',
	InsufficientOutput: 'Amount is too small to trade.',
	TradingHalted: 'Trading is halted for this creator right now.',
	NotSeeded: 'Trading opens when the raise closes.',
	RaiseIsClosed: 'This raise is closed.',
	IsDefaulted: 'This creator defaulted. Investing is closed.',
	ZeroAmount: 'Enter an amount above zero.',
	ERC20InsufficientBalance: 'Your balance is too low for this order.',
	ERC20InsufficientAllowance: 'The approval has not landed yet. Retry.',
}

/** Plain-language text for a wallet, RPC or contract error. */
function describeTxError(err: unknown) {
	if(isRejection(err)) {
		return 'You cancelled the request in your wallet.'
	}

	if(err instanceof BaseError) {
		const revert = err.walk((e) => e instanceof ContractFunctionRevertedError)
		const name = revert instanceof ContractFunctionRevertedError
			? revert.data?.errorName
			: undefined
		if(name && REVERTS[name]) {
			return REVERTS[name]
		}

		if(/insufficient (funds|balance).*gas|gas.*insufficient/i
			.test(err.message)) {
			return NO_HBAR
		}

		return err.shortMessage
	}

	return err instanceof Error ? err.message : String(err)
}

function fail(job: { form: HTMLElement, ticker: string }, err: unknown) {
	const message = describeTxError(err)
	if(message === NO_HBAR) {
		showNotice(job.form, job.ticker, { text: NO_HBAR, hbar: true })
	}

	status(job.form, '')
	toastError(new Error(message))
}

// ── funding notice ─────────────────────────────────────────────────────

function status(form: HTMLElement, text: string) {
	let out = form.querySelector<HTMLElement>('[data-chain-status]')
	if(!out) {
		if(!text) {
			return
		}

		out = document.createElement('p')
		out.className = 'ticket-status'
		out.dataset.chainStatus = ''
		out.setAttribute('role', 'status')
		form.append(out)
	}

	out.textContent = text
}

function clearNotice(form: HTMLElement) {
	form.querySelector('[data-chain-scope]')?.remove()
}

function needUsdc(form: HTMLElement, ticker: string) {
	showNotice(form, ticker, { text: NO_USDC, usdc: true })
}

/** Shows the funding block: faucet button and/or the HBAR faucet link. */
function showNotice(
	form: HTMLElement,
	ticker: string,
	opts: { text: string, usdc?: boolean, hbar?: boolean },
) {
	clearNotice(form)
	const host = document.createElement('div')
	host.className = 'ticket-status'
	host.dataset.chainScope = ticker
	host.setAttribute('role', 'status')
	const text = document.createElement('span')
	text.textContent = `${opts.text} `
	host.append(text)
	if(opts.usdc) {
		const button = document.createElement('button')
		button.type = 'button'
		button.className = 'rc-button'
		button.dataset.chainFaucet = ''
		const count = FAUCET_AMOUNT.toLocaleString('en-US')
		button.textContent = `Get ${count} test USDC`
		host.append(button)
	}

	if(opts.hbar) {
		const link = document.createElement('a')
		link.href = HBAR_FAUCET
		link.target = '_blank'
		link.rel = 'noopener noreferrer'
		link.textContent = 'Get testnet HBAR at portal.hedera.com'
		host.append(link)
	}

	form.append(host)
}

/**
 * Warms the chain info of every trade form on the page and, for a signed-in
 * live wallet with a low USDC balance, shows the faucet button up front.
 */
function paintAll() {
	for(const form of document.querySelectorAll<HTMLFormElement>('form')) {
		const job = classify(form)
		if(job) {
			void paint(job)
		}
	}
}

async function paint({ form, ticker }: Job) {
	try {
		const info = await chainInfo(ticker)
		const address = window.smxWallet?.address()
		const shown = !!form.querySelector('[data-chain-scope]')
		if(info.mode !== 'live' || !address || shown) {
			return
		}

		const pub = createPublicClient({
			transport: http(info.rpcUrl, { retryCount: 2, retryDelay: 1500 }),
		})
		const [usdc, hbar] = await Promise.all([
			pub.readContract({
				address: info.usdc,
				abi: mockUSDCAbi,
				functionName: 'balanceOf',
				args: [getAddress(address)],
			}),
			pub.getBalance({ address: getAddress(address) }),
		])
		if(hbar === 0n) {
			showNotice(form, ticker, { text: NO_HBAR, hbar: true })
		} else if(usdc < LOW_USDC) {
			showNotice(form, ticker, {
				text: `You hold ${formatUnits(usdc, USDC_DECIMALS)} USDC.`,
				usdc: true,
			})
		}
	} catch{
		// Display only: the submit path re-checks and reports.
	}
}
