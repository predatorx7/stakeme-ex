# Smart contracts

This document explains how the SMX contracts in `packages/contracts` work and
how to build, test and deploy them.

## Overview

Each creator launches one income share agreement (ISA). Investors buy share
tokens with USDC, the USDC waits in escrow, and an oracle releases it to the
creator in tranches. When the raise closes, the ISA seeds a constant-product
pool so holders can trade the shares. The creator pays dividends back to token
holders. If the creator defaults, the remaining escrow and the creator's stake
go back to investors.

| Contract | Purpose |
| --- | --- |
| `MockUSDC` | Six-decimal test token with an open `mint` and a capped `faucet`. |
| `CreatorShareToken` | ERC-20 share token with built-in dividend accounting. Deployed once as an implementation; each ISA gets a clone. |
| `LiquidISA` | One clone per creator. Holds escrow, stake and dividends, and seeds the pool. |
| `CreatorPool` | One clone per ISA. Constant-product AMM between USDC and the creator's share token. |
| `LiquidISAFactory` | Clones ISAs, tokens and pools, maps each World ID nullifier to its ISA and keeps the default blacklist. |

### MockUSDC

- `mint(to, amount)` is open. ISAs use it to seed pools with demo liquidity.
- `faucet(to, amount)` lets demo wallets fund themselves. It reverts with
  `FaucetCapExceeded` when `amount` exceeds `FAUCET_CAP` (50,000 USDC, or
  `50_000 * 1e6` base units) per call.

## Minimal proxy clones

Deploying a full `LiquidISA` (about 6.2 KB) plus a `CreatorShareToken` for every
IPO cost 3 to 5 testnet HBAR on Hedera. The factory now clones the ISA, the
token and the pool with [EIP-1167](https://eips.ethereum.org/EIPS/eip-1167)
minimal proxies (OpenZeppelin `Clones`), so an IPO deploys three 45-byte
proxies.

```mermaid
flowchart LR
	F["LiquidISAFactory"] -- "clone()" --> I["LiquidISA clone"]
	F -- "clone()" --> T["CreatorShareToken clone"]
	F -- "clone()" --> P["CreatorPool clone"]
	I -. "delegatecall" .-> IA["LiquidISA implementation"]
	T -. "delegatecall" .-> TA["CreatorShareToken implementation"]
	P -. "delegatecall" .-> PA["CreatorPool implementation"]
	F -- "initialize()" --> I
	F -- "initialize()" --> T
	F -- "initialize()" --> P
```

- Constructors became `initialize(...)` (OpenZeppelin `Initializable`). The
  implementations call `_disableInitializers()` in their constructors, so only
  clones can be initialized, once.
- Per-ISA configuration (`usdc`, `creator`, `oracle`, `totalRaise`, and so on)
  lives in storage instead of `immutable` fields. The public getters keep their
  names and types.
- `CreatorShareToken` stores `name` and `symbol` in storage and overrides
  `name()` and `symbol()`.
- The factory constructor is
  `(usdc, oracle, isaImplementation, tokenImplementation, poolImplementation)`.
  All five are `immutable` public getters (`poolImplementation` for the pool).
- `createISA` clones and initializes the pool, token and ISA, then stores
  `poolOf[isa]` and emits `PoolCreated(isa, pool, token)` before
  `ISACreated(creator, isa, token, ticker)`. `LiquidISA.initialize(params, token, pool)`
  takes the pool address.

A fresh factory is cheap, so reseeding a demo means deploying a new factory.
There is no nullifier reset function, which keeps the one-ISA-per-nullifier
Sybil check intact.

## Lifecycle

```mermaid
sequenceDiagram
	participant C as Creator
	participant F as LiquidISAFactory
	participant I as LiquidISA
	participant P as CreatorPool
	participant V as Investor or trader
	participant O as Oracle
	C->>F: createISA()
	F-->>C: ISA, token and pool clones (PoolCreated, ISACreated)
	C->>I: initializeIPO() locks stake
	V->>I: invest(usdcAmount), user-signed
	I-->>V: mint shares, 1 USDC = 1 share
	Note over I: raise fills or creator calls closeRaise()
	I->>I: raiseClosed = true, start term
	I->>P: seed pool (mint USDC and tokens, seed())
	I->>C: release tranche 0 (unless frozen)
	V->>P: swapExactUsdcForTokens / swapExactTokensForUsdc
	O->>I: unlockNextTranche() per milestone
	alt missed deadline
		O->>I: freezeEscrow()
		Note over I,P: tranches stop, tradingOpen() is false
		O->>I: unfreezeEscrow()
	else default
		O->>I: executeLiquidation()
		Note over I,P: trading halts, holders claim() refunds
	end
```

1. The factory creates the ISA, token and pool with `createISA`. The caller
   becomes the creator. An empty tranche array defaults to `[2000, 4000, 4000]`
   basis points.
2. The creator calls `initializeIPO()`, which locks the USDC stake. Investing
   fails until you do this.
3. Investors call `invest(usdcAmount)` and receive 1 share token per 1 USDC.
   Amounts above the remaining capacity are trimmed. When the raise fills, the
   contract closes the raise, seeds the pool and releases tranche 0 to the
   creator.
4. The creator can call `closeRaise()` to end the raise early (it needs a
   nonzero `raised`). It runs the same close steps. Tranches are computed from
   the amount raised, so they resize automatically.
5. The oracle calls `unlockNextTranche()` after each verified milestone. The
   last tranche sweeps any rounding remainder.
6. Anyone calls `distributeDividend(amount)`. Holders call `claim()`.
7. After the term ends without a default, the creator calls `reclaimStake()`.
8. The oracle can call `freezeEscrow()` and `unfreezeEscrow()` at any time (see
   [Safe-stop](#safe-stop)).

### User-signed invest

`invest` pulls USDC from `msg.sender` with `safeTransferFrom` and mints shares
to `msg.sender`. The investor signs two transactions from their own wallet: the
USDC `approve(isa, amount)`, then `invest(amount)`. The server never invests on
a user's behalf. Because the call trims to the remaining capacity, approve at
least the amount you intend to spend.

## Pool

`CreatorPool` is a constant-product AMM (`x * y = k`) between MockUSDC (6
decimals) and one creator's share token (18 decimals).

### Seeding

When the raise closes, `LiquidISA` runs `_seedPool()` once:

- USDC seed = `poolSeedUsdc()`: 10% of `totalRaise` (the raise target), with a
  minimum of `MIN_POOL_SEED` (100 USDC).
- Token seed = USDC seed `* SCALE`, the same count of tokens at the IPO price of
  1 USDC. Total supply is therefore `raised + pool seed`.
- The ISA calls `token.setExcluded(pool)`, mints the USDC (protocol-provided
  demo liquidity through `MockUSDC.mint`) and tokens to the pool, then calls
  `pool.seed(usdcAmount, tokenAmount)`. `seed` is callable only by the ISA, once,
  and reverts with `NotFunded` if the pool balances are short. It emits
  `Seeded`.

### Swaps

| Function | Does |
| --- | --- |
| `swapExactUsdcForTokens(amountIn, minOut, to)` | Spends USDC (approve the pool first), sends tokens to `to`. |
| `swapExactTokensForUsdc(amountIn, minOut, to)` | Sells tokens (approve the pool first), sends USDC to `to`. |
| `quoteBuy(amountIn)` / `quoteSell(amountIn)` | Output for an input, rounded down. |
| `getReserves()` | Returns `(usdcReserve, tokenReserve)`. |
| `tradingOpen()` | `seeded` and the ISA's `tradingOpen()`. |

- The fee is `FEE_BPS = 30` (0.3%) of the input. It stays in the pool, so `k`
  grows and the fee accrues to liquidity rather than a recipient.
- Output is `floor(rOut * in * 997 / (rIn * 1000 + in * 997))`. This matches the
  SQL `amm_swap` function.
- A swap reverts with `ZeroAmount`, `NotSeeded`, `TradingHalted`,
  `InsufficientOutput` or `Slippage`. Each swap emits `Swap`.

### Trading gate

`LiquidISA.tradingOpen()` returns `raiseClosed && !defaulted && !frozen`. Pool
swaps revert with `TradingHalted` otherwise. `LiquidISA.pool()` returns the
pool address, and the factory exposes it as `poolOf(isa)`.

## Dividend math

`CreatorShareToken` uses the ERC-2222 pattern. It stores:

- `magnifiedDividendPerShare`: increases by `amount * 2^128 / circulatingSupply` on
  each distribution.
- A signed correction per holder that every mint and transfer adjusts by
  `magnifiedDividendPerShare * value`.
- `withdrawnDividends` per holder.

A holder's withdrawable amount is:

```text
(magnifiedDividendPerShare * balance + correction) / 2^128 - withdrawn
```

The corrections keep earned dividends fixed when tokens move, so a transfer
between a distribution and a claim doesn't change anyone's accrued amount.
Distribution costs the same gas for one holder or one million.

The pool is excluded. `CreatorShareToken.setExcluded(pool)` (owner-only, once)
records it, and `circulatingSupply()` returns `totalSupply() - balanceOf(excluded)`.
`accrue` divides by `circulatingSupply()` instead of `totalSupply()`, and
`accumulativeDividendOf(excluded)` returns 0. Holders get the full dividend, and
pool tokens never dilute it or collect a share. `accrue` reverts with `NoShares`
when `circulatingSupply()` is 0. Division floors,
so a payout can be one base unit (0.000001 USDC) short of the exact share.

## Liquidation

Only the oracle can call `executeLiquidation()`. The contract:

1. Sets `defaulted`, which blocks investing, unlocking and distributing, and
   closes pool trading.
2. Adds the remaining `escrowBalance` plus the creator stake to the dividend
   accumulator, so holders claim refunds pro rata with `claim()`. The pool's
   tokens are excluded from the denominator, so the pool takes no refund.
3. Calls the factory to blacklist the creator's World ID nullifier.
4. Emits `CreatorDefaulted(nullifierHash, refunded, slashed)`.

If `circulatingSupply()` is 0, the stake returns to the creator.

## Safe-stop

`freezeEscrow()` and `unfreezeEscrow()` are oracle-only. They set the `frozen`
flag and emit `EscrowFrozen(by)` and `EscrowUnfrozen(by)`. The 0G agent freezes
the escrow when a creator misses a proof deadline and unfreezes it after a late
approved proof.

While `frozen` is true:

- `unlockNextTranche()` and `reclaimStake()` revert with `EscrowFrozenError`.
- A raise that fills (or `closeRaise()`) still closes but doesn't release tranche
  0. The oracle releases it with `unlockNextTranche()` after unfreezing.
- `tradingOpen()` is false, so pool swaps revert with `TradingHalted`.
- Investing (while the raise is open), claiming, dividends and
  `executeLiquidation()` keep working, so a freeze never traps investor money.

## Hedera ATS equity token (ATS-ready, simulated)

`setAtsToken(address)` (oracle-only, once) records the Hedera Asset
Tokenization Studio equity token for the ISA and emits `AtsTokenSet`. Minting
runs in simulated mode on testnet. `CreatorShareToken` stays the source of truth
for escrow and dividend math; the ATS token mirrors it in the regulated
registry. See
[Hedera integration](integrations/hedera.md#mint-a-creator-equity-token-with-ats).

## Nullifiers

`createISA` reverts with `NullifierUsed` if the nullifier already has an ISA and
with `NullifierBlacklisted` if it is blacklisted. The factory stores the
mapping in `isaOfNullifier`. The oracle can also call
`blacklist(nullifier)` on the factory directly.

## Build and test

```bash
cd packages/contracts
npm run build   # compile and export ABIs
npm test
```

## Deploy

Hedera testnet uses a viem script, not Ignition: Ignition's automatic gas limit
gets HTTP 400 from Hashio. Hedera bills at least 80% of the gas limit at about
1,240 gwei, so the script sets each limit to `estimateGas` plus 20%.

```bash
npm run deploy:hedera              # reuse the MockUSDC in USDC_ADDRESS
npm run deploy:hedera -- --new-usdc  # also deploy a fresh MockUSDC
```

The script reads `ORACLE_PRIVATE_KEY` from the root `.env` (the deployer is
the oracle) and:

1. Deploys the `LiquidISA`, `CreatorShareToken` and `CreatorPool`
   implementations and the factory, waiting for each receipt.
2. Polls the Hedera mirror node
   (`https://testnet.mirrornode.hedera.com/api/v1/contracts/<address>`) until it
   returns each contract.
3. Prints the addresses and the HBAR spent.
4. Updates `FACTORY_ADDRESS` (and `USDC_ADDRESS` with `--new-usdc`) in the root
   `.env` and writes `packages/contracts/deployments/hedera-testnet.json`.

Run `npm run abis` afterward: it merges `deployments/*.json` and the Ignition
journals into `src/deployments.gen.ts`.

Other networks still use Ignition. Set the keys as Hardhat configuration
variables and never commit them:

```bash
npx hardhat vars set SEPOLIA_PRIVATE_KEY
npx hardhat vars set SEPOLIA_RPC_URL
npx hardhat vars set OG_PRIVATE_KEY
npm run deploy:sepolia
npm run deploy:0g       # 0G Galileo, chain 16602, https://evmrpc-testnet.0g.ai
```

For a local chain, run `npm run node` and `npm run deploy:local`.

### Costs on Hedera testnet

| Action | Before clones | With clones |
| --- | --- | --- |
| `createISA` | about 3 to 5 HBAR | about 0.76 HBAR |
| One-off deploy (two implementations and factory) | about 4.3 HBAR (factory only plus USDC) | about 3.7 HBAR (measured before the pool; expect more with the third implementation) |

### Mirror-node lag

Hashio reads go through the mirror node. For a few seconds after a deploy,
reads and `estimateGas` on the new address fail with `FAIL_INVALID`, and a
second transaction right after a receipt can fail with "nonce too low".
`packages/app/src/integrations/chain.ts` retries `FAIL_INVALID` (10 tries, 2 s
apart), retries nonce errors with a locally tracked nonce, and waits for the
mirror node to know a new ISA before `createISA` returns. It also sets every
call's gas limit to `estimateGas` plus 20%.

## Verification

Sourcify verified all five Hedera testnet contracts below with an exact
runtime-bytecode match, and HashScan reads it (verified 2026-11-07). Sourcify
reports `match: exact_match` and doesn't report `creationMatch`:

| Contract | Address | Status |
| --- | --- | --- |
| MockUSDC (with `faucet`) | [`0x40027d9375311fa44b95ef881a92374b1dbf8ec4`](https://hashscan.io/testnet/contract/0x40027d9375311fa44b95ef881a92374b1dbf8ec4) | exact match |
| LiquidISA (implementation) | [`0x3f61050ad9fb221992742f10b34237b06a97e361`](https://hashscan.io/testnet/contract/0x3f61050ad9fb221992742f10b34237b06a97e361) | exact match |
| CreatorShareToken (implementation) | [`0x81521abe9ddc7dc792b4c6f4262a48bc744426ff`](https://hashscan.io/testnet/contract/0x81521abe9ddc7dc792b4c6f4262a48bc744426ff) | exact match |
| CreatorPool (implementation) | [`0xe310d76b357be72439e78fff84a82fe486fba84b`](https://hashscan.io/testnet/contract/0xe310d76b357be72439e78fff84a82fe486fba84b) | exact match |
| LiquidISAFactory (with `poolImplementation`) | [`0xc6b7af9392538bc596caed4a5758b9d92f650e59`](https://hashscan.io/testnet/contract/0xc6b7af9392538bc596caed4a5758b9d92f650e59) | exact match |

An earlier factory (`0x9698e237201c88be262523ef4917b144e857ca73`) and its
implementations are no longer used. The 2026-11-06T18:53Z redeploy replaced
them.

Clones (for example ISA `0x8f2868df0f4156d728c3fc703af33d1b7d210e5c`) are
45-byte EIP-1167 proxies. Sourcify cannot match a proxy to source, so a clone
shows no source of its own; it delegates to the verified `LiquidISA`
implementation above (and each token clone to the verified `CreatorShareToken`).

```bash
npm run verify:hedera -w packages/contracts
```

The script posts the solc standard-json input from `artifacts/build-info` (the
exact viaIR build that produced each artifact, no recompile) to Sourcify chain
296, then prints HashScan links. It needs no keys and is safe to rerun. Notes:

- HashScan's old verifier host `server-verify.hashscan.io` now 308-redirects to
  `https://sourcify.dev/server`, which lists Hedera testnet as supported. The
  Hardhat config sets `verify.sourcify.apiUrl` to that server.
- `MockUSDC` comes from the older build-info (`solc-0_8_28-4131...`); the other
  three come from the clone build (`solc-0_8_28-92e3...`). Both match the
  on-chain runtime bytecode. If you recompile with different settings or edit
  sources, the artifacts will no longer match what was deployed.

## Use from the app

```ts
import { liquidISAAbi, deployments } from "@stakeme/contracts";
```
