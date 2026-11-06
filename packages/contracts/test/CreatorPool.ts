import { network } from 'hardhat'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getAddress, keccak256, toHex } from 'viem'

const usdc = (n: number | string) => BigInt(Math.round(Number(n) * 1e6))
const tok = (n: bigint) => n * 10n ** 18n
const NULLIFIER = keccak256(toHex('pool-creator'))

describe('CreatorPool', async() => {
	const { viem, networkHelpers } = await network.create()
	const [oracle, creator, alice, bob] = await viem.getWalletClients()

	/** Target 10,000 USDC => pool seed 1,000 USDC + 1,000 tokens (price 1.0). */
	async function setup(stake = 1000) {
		const mock = await viem.deployContract('MockUSDC')
		const isaImpl = await viem.deployContract('LiquidISA')
		const tokenImpl = await viem.deployContract('CreatorShareToken')
		const poolImpl = await viem.deployContract('CreatorPool')
		const factory = await viem.deployContract('LiquidISAFactory', [
			mock.address, oracle.account.address, isaImpl.address, tokenImpl.address, poolImpl.address,
		])
		await factory.write.createISA(
			['Ravi Kumar', 'RAVI', usdc(10_000), usdc(stake), 1000, 24, [], NULLIFIER],
			{ account: creator.account },
		)
		const isa = await viem.getContractAt('LiquidISA', await factory.read.allISAs([0n]))
		const token = await viem.getContractAt('CreatorShareToken', await isa.read.token())
		const pool = await viem.getContractAt('CreatorPool', await factory.read.poolOf([isa.address]))
		for(const w of [creator, alice, bob]) {
			// Public faucet (capped), then approvals from the user's own wallet.
			await mock.write.faucet([w.account.address, usdc(50_000)], { account: w.account })
			await mock.write.approve([isa.address, 2n ** 255n], { account: w.account })
			await mock.write.approve([pool.address, 2n ** 255n], { account: w.account })
			await token.write.approve([pool.address, 2n ** 255n], { account: w.account })
		}

		await isa.write.initializeIPO({ account: creator.account })
		return { mock, factory, isa, token, pool }
	}

	async function raiseAll(isa: Awaited<ReturnType<typeof setup>>['isa']) {
		await isa.write.invest([usdc(10_000)], { account: alice.account })
	}

	it('caps the faucet and wires the pool from the factory', async() => {
		const { mock, factory, isa, token, pool } = await setup()
		await viem.assertions.revertWithCustomError(
			mock.write.faucet([alice.account.address, usdc(50_001)]), mock, 'FaucetCapExceeded',
		)
		assert.equal(getAddress(await factory.read.poolOf([isa.address])), getAddress(pool.address))
		assert.equal(getAddress(await isa.read.pool()), getAddress(pool.address))
		assert.equal(getAddress(await pool.read.isa()), getAddress(isa.address))
		assert.equal(getAddress(await pool.read.token()), getAddress(token.address))
	})

	it('halts until the raise closes, then seeds the pool and accounts supply', async() => {
		const { mock, isa, token, pool } = await setup()
		await viem.assertions.revertWithCustomError(
			pool.write.swapExactUsdcForTokens([usdc(10), 0n, alice.account.address], { account: alice.account }),
			pool, 'NotSeeded',
		)
		// User-signed invest from the user's own wallet.
		await isa.write.invest([usdc(4000)], { account: alice.account })
		assert.equal(await token.read.balanceOf([alice.account.address]), tok(4000n))
		assert.equal(await token.read.totalSupply(), tok(4000n)) // no pool tokens before close
		await isa.write.invest([usdc(6000)], { account: bob.account })

		assert.deepEqual(await pool.read.getReserves(), [usdc(1000), tok(1000n)])
		assert.equal(await token.read.balanceOf([pool.address]), tok(1000n))
		assert.equal(await mock.read.balanceOf([pool.address]), usdc(1000))
		// totalSupply = raise + pool seed; pool tokens are real mints.
		assert.equal(await token.read.totalSupply(), tok(10_000n) + tok(1000n))
		assert.equal(await token.read.circulatingSupply(), tok(10_000n))
	})

	it('matches the SQL amm_swap math and applies the fee both ways', async() => {
		const { mock, isa, token, pool } = await setup()
		await raiseAll(isa)
		// Expected values come from the SQL expressions in amm_swap (PGlite, numeric):
		// BUY  trunc(t*(i*0.997)/(u+i*0.997), 18), SELL trunc(u*(i*0.997)/(t+i*0.997), 6)
		const steps = [
			['BUY', usdc(10), 9871580343970613000n, usdc(1010), 990128419656029387000n],
			['BUY', usdc('1.234567'), 1205177548750436713n, usdc('1011.234567'), 988923242107278950287n],
			['SELL', 3333333333333333333n, usdc('3.386929'), usdc('1007.847638'), 992256575440612283620n],
			['SELL', tok(5n), usdc('5.038017'), usdc('1002.809621'), 997256575440612283620n],
			['BUY', usdc('250.5'), 198843733999813136747n, usdc('1253.309621'), 798412841440799146873n],
		] as const
		// SQL numeric division keeps ~16 significant digits, so token amounts agree
		// to 1e-15 relative; the contract uses exact integer math (never above SQL by more).
		const closeTo = (a: bigint, b: bigint) => {
			const d = a > b ? a - b : b - a
			assert.ok(d <= 1n || d * 10n ** 15n <= b, `${a} vs ${b}`)
		}

		const k0 = usdc(1000) * tok(1000n)
		for(const [side, amountIn, out, rU, rT] of steps) {
			const buy = side === 'BUY'
			const quote = buy ? await pool.read.quoteBuy([amountIn]) : await pool.read.quoteSell([amountIn])
			closeTo(quote, out)
			const uBefore = await mock.read.balanceOf([bob.account.address])
			const tBefore = await token.read.balanceOf([bob.account.address])
			if(buy) {
				// Bob needs tokens to sell later; buy first from the pool.
				await pool.write.swapExactUsdcForTokens([amountIn, 0n, bob.account.address], { account: bob.account })
				closeTo((await token.read.balanceOf([bob.account.address])) - tBefore, out)
			} else {
				await pool.write.swapExactTokensForUsdc([amountIn, 0n, bob.account.address], { account: bob.account })
				closeTo((await mock.read.balanceOf([bob.account.address])) - uBefore, out)
			}

			const [gotU, gotT] = await pool.read.getReserves()
			closeTo(gotU, rU)
			closeTo(gotT, rT)
		}

		const [u, t] = await pool.read.getReserves()
		assert.ok(u * t > k0, 'fee stays in the pool: k grows')
	})

	it('emits Swap and enforces slippage and zero amounts', async() => {
		const { isa, pool } = await setup()
		await raiseAll(isa)
		const out = await pool.read.quoteBuy([usdc(10)])
		await viem.assertions.revertWithCustomError(
			pool.write.swapExactUsdcForTokens([usdc(10), out + 1n, bob.account.address], { account: bob.account }),
			pool, 'Slippage',
		)
		await viem.assertions.revertWithCustomError(
			pool.write.swapExactUsdcForTokens([0n, 0n, bob.account.address], { account: bob.account }),
			pool, 'ZeroAmount',
		)
		await viem.assertions.emitWithArgs(
			pool.write.swapExactUsdcForTokens([usdc(10), out, bob.account.address], { account: bob.account }),
			pool, 'Swap',
			[getAddress(bob.account.address), usdc(10), 0n, 0n, out, usdc(1010), tok(1000n) - out],
		)
	})

	it('halts when frozen or defaulted; sells stay open after the term completes', async() => {
		const { isa, pool, token } = await setup()
		await raiseAll(isa)
		await pool.write.swapExactUsdcForTokens([usdc(100), 0n, bob.account.address], { account: bob.account })

		await isa.write.freezeEscrow({ account: oracle.account })
		await viem.assertions.revertWithCustomError(
			pool.write.swapExactUsdcForTokens([usdc(1), 0n, bob.account.address], { account: bob.account }),
			pool, 'TradingHalted',
		)
		await viem.assertions.revertWithCustomError(
			pool.write.swapExactTokensForUsdc([tok(1n), 0n, bob.account.address], { account: bob.account }),
			pool, 'TradingHalted',
		)
		await isa.write.unfreezeEscrow({ account: oracle.account })

		// Term (24 months) ends: SQL blocks sells here, the pool does not.
		await networkHelpers.time.increase(24 * 30 * 24 * 3600 + 10)
		await isa.write.unlockNextTranche({ account: oracle.account })
		await isa.write.unlockNextTranche({ account: oracle.account })
		await isa.write.reclaimStake({ account: creator.account })
		const bal = await token.read.balanceOf([bob.account.address])
		await pool.write.swapExactTokensForUsdc([bal, 0n, bob.account.address], { account: bob.account })
		assert.equal(await token.read.balanceOf([bob.account.address]), 0n)

		await isa.write.executeLiquidation({ account: oracle.account })
		await viem.assertions.revertWithCustomError(
			pool.write.swapExactUsdcForTokens([usdc(1), 0n, bob.account.address], { account: bob.account }),
			pool, 'TradingHalted',
		)
	})

	it('refunds current holders on default and excludes pool tokens from the denominator', async() => {
		const { isa, token, pool } = await setup()
		await raiseAll(isa)
		// Bob buys 500 USDC worth from the pool, so the refund must follow current holders.
		await pool.write.swapExactUsdcForTokens([usdc(500), 0n, bob.account.address], { account: bob.account })
		const aliceBal = await token.read.balanceOf([alice.account.address])
		const bobBal = await token.read.balanceOf([bob.account.address])
		const poolBal = await token.read.balanceOf([pool.address])
		assert.ok(poolBal > 0n)

		// 10,000 raised: 2,000 released with tranche 0, so 8,000 escrow + 1,000 stake.
		await isa.write.executeLiquidation({ account: oracle.account })
		const a = await isa.read.withdrawableOf([alice.account.address])
		const b = await isa.read.withdrawableOf([bob.account.address])
		const total = usdc(9000)
		const near = (x: bigint, y: bigint) => assert.ok((x > y ? x - y : y - x) <= 2n, `${x} vs ${y}`)
		near(a + b, total) // pool tokens take no share
		near(a, (total * aliceBal) / (aliceBal + bobBal))
		near(b, (total * bobBal) / (aliceBal + bobBal))
		assert.equal(await isa.read.withdrawableOf([pool.address]), 0n)
	})
})
