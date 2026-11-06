# Integrations

One guide per sponsor integration. Each guide lists the verified package names
and versions (checked on 2026-11-06), environment variables, server and
browser snippets, testnet setup, the demo fallback, and gotchas.

| Sponsor | Guide | Package (version) | Env vars | Demo fallback | Status |
| --- | --- | --- | --- | --- | --- |
| World ID | [world-id.md](world-id.md) | `@worldcoin/idkit-core` 4.6.0 (+ `@worldcoin/idkit-server` 1.2.0) | `WORLD_APP_ID`, `WORLD_RP_ID`, `WORLD_RP_SIGNING_KEY`, `WORLD_ACTION`, `WORLD_ENV` | Simulator (staging action); `DEMO_MODE=1` fixture with a fake nullifier | implemented |
| Reclaim Protocol | [reclaim.md](reclaim.md) | `@reclaimprotocol/js-sdk` 5.8.3 | `RECLAIM_APP_ID`, `RECLAIM_APP_SECRET`, `RECLAIM_PROVIDER_ID` | `DEMO_MODE=1` fixture proof | implemented |
| Hedera | [hedera.md](hedera.md) | `viem` 2.57.16, `@x402/core` + `@x402/hedera` 2.30.0, `@hiero-ledger/sdk` 2.90.1 | `CHAIN_RPC_URL`, `ORACLE_PRIVATE_KEY`, `HEDERA_ACCOUNT_ID`, `HEDERA_PRIVATE_KEY`, `HEDERA_DIVIDEND_TOKEN_ID` | Simulated chain mode; simulated dividend stream | implemented (HTS transfer, not x402) |
| 0G | [zero-g.md](zero-g.md) | `@0gfoundation/0g-compute-ts-sdk` 0.9.0, `@0gfoundation/0g-storage-ts-sdk` 1.2.13, `ethers` 6 | `ZG_RPC_URL`, `ZG_PRIVATE_KEY`, `ZG_INDEXER_URL`, `ZG_PROVIDER_ADDRESS` | SQL rules engine and a local content hash | implemented |
| Chainlink CRE | [chainlink-cre.md](chainlink-cre.md) | `cre` CLI, `@chainlink/cre-sdk` 1.23.0 | `CRE_ETH_PRIVATE_KEY`, `CRE_HTTP_TRIGGER_URL` | pgmb worker runs the same steps | documented (not built) |
| Arkiv | [arkiv.md](arkiv.md) | `@arkiv-network/sdk` 1.0.1 | `ARKIV_ACCESS_KEY`, `ARKIV_PRIVATE_KEY` | Local canonical JSON plus `terms_hash` (sha256) | implemented |
| Arc | [arc.md](arc.md) | `viem` 2.57.16 | `ARC_RPC_URL`, `ARC_PRIVATE_KEY`, `ARC_RELAYER_PRIVATE_KEY` | Not required in simulated mode | documented (no code; Arc is a `CHAIN_RPC_URL` target) |

Arkiv prize files: [`/arkiv/schema.md`](../../arkiv/schema.md) and
[`/arkiv/friction.md`](../../arkiv/friction.md).

## Corrections to the product spec

The research found places where the spec's sponsor table is inaccurate or
incomplete. Treat these guides as current.

- **Arc has no paymaster RPC.** USDC is the native gas token. Gasless flows
  need an EIP-3009 relayer or an ERC-4337 paymaster that you run or buy. See
  [arc.md](arc.md).
- **Hedera x402 moves HBAR or HTS tokens**, not EVM ERC-20 balances. See
  [hedera.md](hedera.md).
- **Chainlink CRE doesn't list Hedera or 0G** as supported chains. It lists
  Ethereum Sepolia and Arc Testnet. CRE writes also need a consumer contract
  that implements `IReceiver`. See [chainlink-cre.md](chainlink-cre.md).
- **0G packages were renamed** to `@0gfoundation/*`. The `@0glabs/*` packages
  are deprecated.
- **World ID is now 4.0.** Use the `/api/v4/verify/{rp_id}` endpoint with an RP
  signature. The old cloud verify v2 endpoint is legacy.
- **Arkiv entities expire after at most about 182 days** per write, so a
  60-month term needs periodic extension.

## Conventions

- Every integration has a "no keys" path so `npm run dev` works offline.
- Secrets live in `.env` (never committed). Variable names are in each guide.
- Integration code lives in `packages/app/src/integrations/` and browser
  modules in `packages/app/src/client/`.

## Implementation notes

Code status after workstream 5 (all verified with `npm run check`, the unit
tests, and a real run of `chain.ts` against a local Hardhat node):

- **Env names.** The code reads exactly the variable names in each guide, plus
  `FACTORY_ADDRESS` (chain), `HEDERA_NETWORK`, `ZG_LEDGER_DEPOSIT`.
  `HEDERA_OPERATOR_ID` / `HEDERA_OPERATOR_KEY` are accepted as aliases of
  `HEDERA_ACCOUNT_ID` / `HEDERA_PRIVATE_KEY`. `PUBLIC_BASE_URL` is not used:
  the route passes an absolute `callbackUrl` to `createReclaimSession`.
- **Demo policy.** Fixture proofs (`demo: true`) work only with `DEMO_MODE=1`.
  Without keys and without `DEMO_MODE`, World ID and Reclaim fail with 503
  rather than pretending. Chain, 0G, Arkiv and Hedera always fall back (with a
  LOGGER warning) because their fallbacks are labeled SIMULATED or `local:`.
- **`terms_hash` is sha256**, not keccak256 (the `StoredTerms` contract says
  sha256). `/arkiv/schema.md` was updated to match. The nullifier is still
  hashed with keccak256 over its decimal string (`nullifierHash`), and the same
  bytes32 is the `worldIdNullifierHash` passed to `createISA`.
- **World ID.** `createWorldIdRequest(signal)` wraps `signRequest`. The route
  must read the signal from the SIWE session wallet.
- **Reclaim.** `verifyProof` runs with the provider id (content validation) and
  adds `teeAttestation` when the proof carries one. The 15 minute freshness
  window and dedupe by `proofId` are enforced by the caller plus the module.
  `toJsonString()` is never returned, so the secret cannot leak.
- **0G.** The model call is `temperature: 0`, JSON only. A model answer that
  accepts more than the deposit, or approves below `minIncome`, is rejected and
  the rules engine runs instead (`model: 'rules-engine'`). We don't call
  `transferFund`; `getRequestHeaders` tops up the provider sub-account.
- **Chain.** The oracle key signs `createISA` (so the oracle is the creator of
  record), `initializeIPO`, `invest` and `distributeDividend`. Short USDC is
  minted when the token is MockUSDC and approved before each call. This is the
  Arc / EIP-3009 relayer simplification, kept honest in the UI copy.
- **Hedera.** Dividends are direct HTS `TransferTransaction`s from the operator
  account to each holder's EVM alias, not an x402 facilitator payment, so the
  operator pays fees (not gasless). Failed payments fall back to `sim:` receipts.
  Not run against a live network.
- **Not run live:** World ID, Reclaim, 0G Compute/Storage, Arkiv and Hedera
  need accounts and keys we don't have. Their code follows the verified
  package types (`tsc` clean) but is unproven end to end.
