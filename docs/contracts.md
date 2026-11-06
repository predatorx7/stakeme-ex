# Smart contracts

This document explains how the SMX contracts in `packages/contracts` work and
how to build, test and deploy them.

## Overview

Each creator launches one income share agreement (ISA). Investors buy share
tokens with USDC, the USDC waits in escrow, and an oracle releases it to the
creator in tranches. The creator pays dividends back to token holders. If the
creator defaults, the remaining escrow and the creator's stake go back to
investors.

| Contract | Purpose |
| --- | --- |
| `MockUSDC` | Six-decimal test token with a public `mint`. |
| `CreatorShareToken` | ERC-20 share token with built-in dividend accounting. |
| `LiquidISA` | One per creator. Holds escrow, stake and dividends. |
| `LiquidISAFactory` | Deploys ISAs, maps each World ID nullifier to its ISA and keeps the default blacklist. |

## Lifecycle

1. The factory creates the ISA with `createISA`. The caller becomes the
   creator. An empty tranche array defaults to `[2000, 4000, 4000]` basis
   points.
2. The creator calls `initializeIPO()`, which locks the USDC stake. Investing
   fails until you do this.
3. Investors call `invest(usdcAmount)` and receive 1 share token per 1 USDC.
   Amounts above the remaining capacity are trimmed. When the raise fills, the
   contract releases tranche 0 to the creator.
4. The creator can call `closeRaise()` to end the raise early. Tranches are
   computed from the amount raised, so they resize automatically.
5. The oracle calls `unlockNextTranche()` after each verified milestone. The
   last tranche sweeps any rounding remainder.
6. Anyone calls `distributeDividend(amount)`. Holders call `claim()`.
7. After the term ends without a default, the creator calls `reclaimStake()`.
8. The oracle can call `freezeEscrow()` and `unfreezeEscrow()` at any time (see
   [Safe-stop](#safe-stop)).

## Dividend math

`CreatorShareToken` uses the ERC-2222 pattern. It stores:

- `magnifiedDividendPerShare`: increases by `amount * 2^128 / totalSupply` on
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
Distribution costs the same gas for one holder or one million. Division floors,
so a payout can be one base unit (0.000001 USDC) short of the exact share.

## Liquidation

Only the oracle can call `executeLiquidation()`. The contract:

1. Sets `defaulted`, which blocks investing, unlocking and distributing.
2. Adds the remaining `escrowBalance` plus the creator stake to the dividend
   accumulator, so holders claim refunds pro rata with `claim()`.
3. Calls the factory to blacklist the creator's World ID nullifier.
4. Emits `CreatorDefaulted(nullifierHash, refunded, slashed)`.

If no shares exist, the stake returns to the creator.

## Safe-stop

`freezeEscrow()` and `unfreezeEscrow()` are oracle-only. They set the `frozen`
flag and emit `EscrowFrozen(by)` and `EscrowUnfrozen(by)`. The 0G agent freezes
the escrow when a creator misses a proof deadline and unfreezes it after a late
approved proof.

While `frozen` is true:

- `unlockNextTranche()` and `reclaimStake()` revert with `EscrowFrozenError`.
- A raise that fills (or `closeRaise()`) still closes but doesn't release tranche
  0. The oracle releases it with `unlockNextTranche()` after unfreezing.
- Investing, claiming, dividends and `executeLiquidation()` keep working, so a
  freeze never traps investor money.

## Hedera ATS equity token

`setAtsToken(address)` (oracle-only, once) records the Hedera Asset
Tokenization Studio equity token minted for the ISA and emits `AtsTokenSet`.
`CreatorShareToken` stays the source of truth for escrow and dividend math; the
ATS token is the regulated registry mirror. See
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

Set the keys as Hardhat configuration variables. Never commit them.

```bash
npx hardhat vars set HEDERA_PRIVATE_KEY
npx hardhat vars set SEPOLIA_PRIVATE_KEY
npx hardhat vars set SEPOLIA_RPC_URL
npx hardhat vars set OG_PRIVATE_KEY
```

Then deploy to a network:

```bash
npm run deploy:hedera   # default target: Hedera testnet, chain 296, https://testnet.hashio.io/api
npm run deploy:sepolia
npm run deploy:0g       # 0G Galileo, chain 16602, https://evmrpc-testnet.0g.ai
```

The deployer account is the oracle unless you pass
`--parameters` with a different `Deploy.oracle`. Run `npm run abis` afterward;
it reads `ignition/deployments/chain-<id>/deployed_addresses.json` into
`src/deployments.gen.ts`. For a local chain, run `npm run node` and
`npm run deploy:local`.

## Use from the app

```ts
import { liquidISAAbi, deployments } from "@stakeme/contracts";
```
