import { network } from 'hardhat'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getAddress, keccak256, toHex } from 'viem'

const usdc = (n: number) => BigInt(n) * 10n ** 6n
const shares = (n: number) => BigInt(n) * 10n ** 18n
/** Dividend math floors per-share values, so payouts can be 1 unit (0.000001 USDC) short. */
const near = (actual: bigint, expected: bigint) => {
	assert.ok(
		expected - actual >= 0n && expected - actual <= 1n,
		`expected ${expected} (up to 1 unit dust), got ${actual}`,
	)
}

const NULLIFIER = keccak256(toHex('creator-world-id'))

describe('LiquidISA', async() => {
	const { viem } = await network.create()
	const [oracle, creator, alice, bob] = await viem.getWalletClients()

	/** Deploys USDC + factory + a 1,000 USDC ISA with a 200 USDC stake and funds everyone. */
	async function setup() {
		const mock = await viem.deployContract('MockUSDC')
		const isaImpl = await viem.deployContract('LiquidISA')
		const tokenImpl = await viem.deployContract('CreatorShareToken')
		const poolImpl = await viem.deployContract('CreatorPool')
		const factory = await viem.deployContract('LiquidISAFactory', [
			mock.address,
			oracle.account.address,
			isaImpl.address,
			tokenImpl.address,
			poolImpl.address,
		])
		await factory.write.createISA(
			['Ravi Kumar', 'RAVI', usdc(1000), usdc(200), 1000, 24, [], NULLIFIER],
			{ account: creator.account },
		)
		const isaAddress = await factory.read.allISAs([0n])
		const isa = await viem.getContractAt('LiquidISA', isaAddress)
		const token = await viem.getContractAt(
			'CreatorShareToken',
			await isa.read.token(),
		)

		for(const w of [creator, alice, bob]) {
			await mock.write.mint([w.account.address, usdc(10_000)])
			await mock.write.approve([isa.address, 2n ** 255n], { account: w.account })
		}

		return { mock, factory, isa, token }
	}

	it('runs the happy path with a transfer between distribution and claim', async() => {
		const { mock, isa, token } = await setup()
		const balance = (a: { account: { address: `0x${string}` } }) => mock.read.balanceOf([a.account.address])

		// Investing before the creator posts the stake is rejected.
		await viem.assertions.revertWithCustomError(
			isa.write.invest([usdc(10)], { account: alice.account }),
			isa,
			'NotInitialized',
		)

		await isa.write.initializeIPO({ account: creator.account })
		await isa.write.invest([usdc(600)], { account: alice.account })
		assert.equal(await isa.read.nextTranche(), 0n)
		await isa.write.invest([usdc(600)], { account: bob.account }) // trimmed to 400

		assert.equal(await token.read.balanceOf([bob.account.address]), shares(400))
		assert.equal(await isa.read.raised(), usdc(1000))
		// Tranche 0 (20%) auto-released.
		assert.equal(await isa.read.nextTranche(), 1n)
		assert.equal(await isa.read.escrowBalance(), usdc(800))
		assert.equal(await balance(creator), usdc(10_000 - 200 + 200))

		await isa.write.unlockNextTranche({ account: oracle.account })
		assert.equal(await isa.read.escrowBalance(), usdc(400))

		// Dividend 1: 60 / 40.
		await isa.write.distributeDividend([usdc(100)], { account: creator.account })
		near(await isa.read.withdrawableOf([alice.account.address]), usdc(60))
		near(await isa.read.withdrawableOf([bob.account.address]), usdc(40))

		// Alice sends half her shares to Bob before claiming: accrued amounts must not move.
		await token.write.transfer([bob.account.address, shares(300)], {
			account: alice.account,
		})
		near(await isa.read.withdrawableOf([alice.account.address]), usdc(60))
		near(await isa.read.withdrawableOf([bob.account.address]), usdc(40))

		// Dividend 2: 300 / 700 split.
		await isa.write.distributeDividend([usdc(100)], { account: creator.account })
		near(await isa.read.withdrawableOf([alice.account.address]), usdc(90))
		near(await isa.read.withdrawableOf([bob.account.address]), usdc(110))

		const aliceBefore = await balance(alice)
		await isa.write.claim({ account: alice.account })
		near((await balance(alice)) - aliceBefore, usdc(90))
		assert.equal(await isa.read.withdrawableOf([alice.account.address]), 0n)
		await isa.write.claim({ account: bob.account })
		assert.equal(await isa.read.withdrawableOf([bob.account.address]), 0n)
	})

	it('liquidates: refunds escrow and stake pro rata and blacklists the nullifier', async() => {
		const { mock, factory, isa } = await setup()
		await isa.write.initializeIPO({ account: creator.account })
		await isa.write.invest([usdc(600)], { account: alice.account })
		await isa.write.invest([usdc(400)], { account: bob.account })
		// 200 released to the creator; 800 escrow + 200 stake remain.

		await viem.assertions.emitWithArgs(
			isa.write.executeLiquidation({ account: oracle.account }),
			isa,
			'CreatorDefaulted',
			[NULLIFIER, usdc(800), usdc(200)],
		)
		assert.equal(await isa.read.defaulted(), true)
		assert.equal(await isa.read.escrowBalance(), 0n)
		near(await isa.read.withdrawableOf([alice.account.address]), usdc(600))
		near(await isa.read.withdrawableOf([bob.account.address]), usdc(400))

		const before = await mock.read.balanceOf([alice.account.address])
		await isa.write.claim({ account: alice.account })
		near((await mock.read.balanceOf([alice.account.address])) - before, usdc(600))

		assert.equal(await factory.read.blacklisted([NULLIFIER]), true)
		await viem.assertions.revertWithCustomError(
			factory.write.createISA(
				['Again', 'AGN', usdc(1), 0n, 1000, 12, [], NULLIFIER],
				{ account: creator.account },
			),
			factory,
			'NullifierBlacklisted',
		)
	})

	it('restricts unlock and liquidation to the oracle', async() => {
		const { isa } = await setup()
		await viem.assertions.revertWithCustomError(
			isa.write.unlockNextTranche({ account: creator.account }),
			isa,
			'NotOracle',
		)
		await viem.assertions.revertWithCustomError(
			isa.write.executeLiquidation({ account: alice.account }),
			isa,
			'NotOracle',
		)
		assert.equal(getAddress(await isa.read.oracle()), getAddress(oracle.account.address))
	})

	it('freezes the escrow: blocks tranche unlocks, oracle only, then resumes', async() => {
		const { isa } = await setup()
		await isa.write.initializeIPO({ account: creator.account })
		await isa.write.invest([usdc(1000)], { account: alice.account })
		assert.equal(await isa.read.nextTranche(), 1n)

		await viem.assertions.revertWithCustomError(
			isa.write.freezeEscrow({ account: creator.account }),
			isa,
			'NotOracle',
		)
		await viem.assertions.emitWithArgs(
			isa.write.freezeEscrow({ account: oracle.account }),
			isa,
			'EscrowFrozen',
			[getAddress(oracle.account.address)],
		)
		await viem.assertions.revertWithCustomError(
			isa.write.unlockNextTranche({ account: oracle.account }),
			isa,
			'EscrowFrozenError',
		)

		await isa.write.unfreezeEscrow({ account: oracle.account })
		await isa.write.unlockNextTranche({ account: oracle.account })
		assert.equal(await isa.read.nextTranche(), 2n)
	})

	it('keeps two clones independent and locks the implementations', async() => {
		const { mock, factory, isa, token } = await setup()
		await factory.write.createISA(
			['Second', 'TWO', usdc(500), 0n, 500, 12, [5000, 5000], keccak256(toHex('other'))],
			{ account: alice.account },
		)
		const isa2 = await viem.getContractAt('LiquidISA', await factory.read.allISAs([1n]))
		const token2 = await viem.getContractAt('CreatorShareToken', await isa2.read.token())
		assert.notEqual(getAddress(isa2.address), getAddress(isa.address))
		assert.equal(await token.read.symbol(), 'RAVI')
		assert.equal(await token2.read.symbol(), 'TWO')
		assert.equal(await token2.read.name(), 'Second')
		assert.equal(getAddress(await isa2.read.creator()), getAddress(alice.account.address))

		await mock.write.approve([isa2.address, 2n ** 255n], { account: bob.account })
		await isa.write.initializeIPO({ account: creator.account })
		await isa.write.invest([usdc(300)], { account: alice.account })
		await isa2.write.initializeIPO({ account: alice.account })
		await isa2.write.invest([usdc(100)], { account: bob.account })
		assert.equal(await isa.read.raised(), usdc(300))
		assert.equal(await isa2.read.raised(), usdc(100))
		assert.equal(await token.read.totalSupply(), shares(300))
		assert.equal(await token2.read.totalSupply(), shares(100))
		assert.equal(await isa2.read.trancheCount(), 2n)
		assert.equal(await isa.read.trancheCount(), 3n)

		// Re-initializing a clone or the implementation is rejected.
		const impl = await viem.getContractAt('LiquidISA', await factory.read.isaImplementation())
		await viem.assertions.revertWithCustomError(
			token.write.initialize(['X', 'X', alice.account.address]),
			token,
			'InvalidInitialization',
		)
		await viem.assertions.revertWithCustomError(
			impl.write.initialize([{
				usdc: mock.address, creator: alice.account.address, oracle: alice.account.address,
				totalRaise: 1n, creatorStake: 0n, shareBps: 1, termMonths: 1,
				trancheBps: [10000], worldIdNullifierHash: NULLIFIER,
			}, token.address, alice.account.address]),
			impl,
			'InvalidInitialization',
		)
	})
})
