# Integrations

One guide per sponsor integration. Each guide lists the verified package names
and versions (checked on 2026-11-06), environment variables, server and
browser snippets, testnet setup, the demo fallback, and gotchas.

| Sponsor | Guide | Package (version) | Env vars | Demo fallback | Status |
| --- | --- | --- | --- | --- | --- |
| World ID | [world-id.md](world-id.md) | `@worldcoin/idkit-core` 4.6.0 (+ `@worldcoin/idkit-server` 1.2.0) | `WORLD_APP_ID`, `WORLD_RP_ID`, `WORLD_RP_SIGNING_KEY`, `WORLD_ACTION`, `WORLD_ENV` | Simulator (staging action); `DEMO_MODE=1` fixture with a fake nullifier | documented |
| Reclaim Protocol | [reclaim.md](reclaim.md) | `@reclaimprotocol/js-sdk` 5.8.3 | `RECLAIM_APP_ID`, `RECLAIM_APP_SECRET`, `RECLAIM_PROVIDER_ID`, `PUBLIC_BASE_URL` | `DEMO_MODE=1` fixture proof | documented |
| Hedera | [hedera.md](hedera.md) | `viem` 2.57.16, `@x402/core` + `@x402/hedera` 2.30.0, `@hiero-ledger/sdk` 2.90.1 | `CHAIN_RPC_URL`, `ORACLE_PRIVATE_KEY`, `HEDERA_ACCOUNT_ID`, `HEDERA_PRIVATE_KEY`, `HEDERA_DIVIDEND_TOKEN_ID` | Simulated chain mode; simulated dividend stream | documented |
| 0G | [zero-g.md](zero-g.md) | `@0gfoundation/0g-compute-ts-sdk` 0.9.0, `@0gfoundation/0g-storage-ts-sdk` 1.2.13, `ethers` 6 | `ZG_RPC_URL`, `ZG_PRIVATE_KEY`, `ZG_INDEXER_URL`, `ZG_PROVIDER_ADDRESS` | SQL rules engine and a local content hash | documented |
| Chainlink CRE | [chainlink-cre.md](chainlink-cre.md) | `cre` CLI, `@chainlink/cre-sdk` 1.23.0 | `CRE_ETH_PRIVATE_KEY`, `CRE_HTTP_TRIGGER_URL` | pgmb worker runs the same steps | documented |
| Arkiv | [arkiv.md](arkiv.md) | `@arkiv-network/sdk` 1.0.1 | `ARKIV_ACCESS_KEY`, `ARKIV_PRIVATE_KEY` | Local canonical JSON plus `terms_hash` | documented |
| Arc | [arc.md](arc.md) | `viem` 2.57.16 | `ARC_RPC_URL`, `ARC_PRIVATE_KEY`, `ARC_RELAYER_PRIVATE_KEY` | Not required in simulated mode | documented |

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
