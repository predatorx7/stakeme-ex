# Integrations

The MVP uses three sponsors (Hedera, World ID, 0G) plus Reclaim as the zkTLS
proof source. Each guide covers package versions (checked on 2026-11-06),
environment variables, snippets, testnet setup, the demo fallback, and
gotchas. Sponsors dropped from scope are in [`../deprecated/`](../deprecated/).

| Sponsor | Guide | Package (version) | Env vars | Demo fallback | Status |
| --- | --- | --- | --- | --- | --- |
| World ID | [world-id.md](world-id.md) | `@worldcoin/idkit-core` 4.6.0 | `WORLD_APP_ID`, `WORLD_RP_ID`, `WORLD_RP_SIGNING_KEY`, `WORLD_ACTION`, `WORLD_ENV` | Simulator (staging action); `DEMO_MODE=1` fixture with a fake nullifier | MVP, implemented |
| Reclaim Protocol | [reclaim.md](reclaim.md) | `@reclaimprotocol/client` 0.1.43 | `RECLAIM_ORG_SECRET`, `RECLAIM_PROVIDER_ID`, `RECLAIM_ORG_ETH_PRIVATE_KEY` (optional) | `DEMO_MODE=1` fixture proof | MVP, implemented |
| Hedera | [hedera.md](hedera.md) | `@hiero-ledger/sdk`, `viem` | `CHAIN_RPC_URL`, `ORACLE_PRIVATE_KEY`, `HEDERA_OPERATOR_ID`, `HEDERA_OPERATOR_KEY`, `HEDERA_DIVIDEND_TOKEN_ID` | Simulated chain mode; simulated payouts | MVP, implemented |
| 0G | [zero-g.md](zero-g.md) | `@0gfoundation/0g-compute-ts-sdk` 0.9.0, `@0gfoundation/0g-storage-ts-sdk` 1.2.13, `ethers` 6 | `ZG_RPC_URL`, `ZG_PRIVATE_KEY`, `ZG_INDEXER_URL`, `ZG_PROVIDER_ADDRESS`, `STORAGE_PROVIDER` | SQL rules engine and `local:<sha256>` refs | MVP, implemented |

## Adapters

Routes and workers never import a sponsor SDK. They call the adapters in
`packages/app/src/services/` through factories. See
[../architecture-adapters.md](../architecture-adapters.md).

| Interface | Default | Factory |
| --- | --- | --- |
| `IStorageProvider` | `ZeroGravityStorage` (0G Storage Log Layer), `LocalStorageProvider` fallback | `createStorageProvider()` |
| `IOracle` | `ZeroGravityAgent` (Reclaim results, 0G Compute audit) | `createOracle()` |
| `IPaymentRail` | `HederaPaymentRail` (simulated without keys) | `createPaymentService(pg)` |

## Corrections to the product spec

- **Hedera x402 moves HBAR or HTS tokens**, not EVM ERC-20 balances. See
  [hedera.md](hedera.md).
- **0G packages were renamed** to `@0gfoundation/*`. The `@0glabs/*` packages
  are deprecated.
- **World ID is now 4.0.** Sign the RP request on the server and verify with
  `POST https://developer.world.org/api/v4/verify/{rp_id}`.
- **Reclaim moved to Builder's `@reclaimprotocol/client`** (sessions and
  results), replacing `@reclaimprotocol/js-sdk`.

## Conventions

- Every integration has a "no keys" path so `npm run dev` works offline.
- Secrets live in `.env` (never committed). Variable names are in each guide.
- SDK code lives in `packages/app/src/integrations/` and
  `packages/app/src/services/`; browser modules in `packages/app/src/client/`.

## Implementation notes

- **Demo policy.** Fixture proofs (`demo: true`) work only with `DEMO_MODE=1`.
  Without keys and without `DEMO_MODE`, World ID and Reclaim fail with 503
  rather than pretending. Storage, 0G Compute and the payment rail always fall
  back (with a LOGGER warning) because their fallbacks are labeled
  `local:`, `rules-engine` or `sim:`.
- **`terms_hash` is sha256** of the canonical terms JSON. The nullifier is
  hashed with keccak256 over its decimal string (`nullifierHash`) before it
  goes into a public record.
- **World ID.** `POST /api/rp-signature` signs with
  `@worldcoin/idkit-core/signing` on the server. The signal is the SIWE session
  wallet. The server verifies the proof with the v4 endpoint, stores the
  nullifier (unique; blacklisted on default) and passes it to the `createISA`
  chain job.
- **Reclaim.** `sessions.create` opens a session, `results.receive` verifies
  the callback (the org currently delivers plaintext results; pass
  `RECLAIM_ORG_ETH_PRIVATE_KEY` only if encryption is on). See
  [reclaim.md](reclaim.md).
- **0G.** The model call is `temperature: 0`, JSON only. A model answer that
  accepts more than the deposit, or approves below `minIncome`, is rejected and
  the rules engine runs instead (`model: 'rules-engine'`). The L-ISA legal
  terms and every approve or deny log go to 0G Storage; the refs are stored in
  Postgres (`creators.terms_ref`, `income_proofs.audit_log_ref`).
- **Not run live:** World ID, 0G Compute/Storage and Hedera payouts need
  accounts and keys. Their code follows the verified package types (`tsc`
  clean) but is unproven end to end.
