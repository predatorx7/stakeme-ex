# CONTEXT

Hand-off file. Any agent picking up work reads this first, then
[`docs/product-spec.md`](docs/product-spec.md) and
[`docs/engineering-guide.md`](docs/engineering-guide.md). Update this file
when you finish a workstream: move items between sections, note decisions.

Reference clones (read-only, may be deleted; re-clone with `gh repo clone`):

- Builder: `reclaimprotocol/builder`
- Design system: `reclaimprotocol/reclaim-design`

## Decisions

- Architecture follows Builder (Express 5, OpenAPI, PGTyped, Kita TSX, htmx,
  `@reclaimprotocol/design`). The playbook's Next.js/wagmi/recharts stack is
  replaced by this. Browser web3 uses `viem`; World ID uses
  `@worldcoin/idkit-core`.
- npm scope `@stakeme`, schema `smx`, dev port 4020, Docker Postgres host port
  5442.
- Contracts: Hardhat 3 + viem in `packages/contracts`.
- Simulated chain mode when `CHAIN_RPC_URL` is unset, so the demo runs with no
  keys.
- Tests only for core logic: SQL business functions, contract math. No UI or
  broad e2e suites.
- Docs follow the Google developer documentation style guide.

### Scope update (2026-11-06): MVP = Reclaim, Hedera, World ID, 0G

- Build only Reclaim, Hedera, World ID, and 0G for the Friday/Saturday MVP.
  Chainlink CRE, Arkiv, and Arc/Whitechain are omitted (Sunday stretch).
- Adapter pattern so omitted sponsors drop in later without touching app logic:
  - `IStorageProvider`, default `ZeroGravityStorage` (0G Storage). Arkiv later
    as `ArkivStorage`. L-ISA terms and audit logs go through this interface.
  - `IOracle` fetches and verifies Reclaim proofs. Implemented directly by
    `ZeroGravityAgent` (which also runs the 0G audit). Chainlink later as
    `ChainlinkCREAdapter`.
  - `PaymentService` executes dividend payouts over a payment rail. Default
    `HederaPaymentRail` (standard Hedera testnet transactions). Arc later as
    `ArcPaymasterRail`.
- Reclaim uses Builder's `@reclaimprotocol/client` (`sessions.create`,
  `results.receive`) and a provider built with the Reclaim MCP, replacing
  `@reclaimprotocol/js-sdk`. Org: `73351799-e315-4b65-bb8e-4df3496c7ec5`.
  `RECLAIM_ORG_SECRET` is in `.env` (gitignored, never print it). Local
  callbacks arrive through the MCP `proxy_callback_events` tool.
- `/arkiv/schema.md` and `/arkiv/friction.md` stay for the Sunday stretch.

### Scope update 2 (2026-11-06, supersedes the stretch plan above)

- Exactly three sponsors: **Hedera, World ID, 0G**. Chainlink CRE, Arkiv, Arc,
  and Whitechain are deprecated: no code, no env vars, no adapter seams named
  after them. Their docs moved to `docs/deprecated/`. Reclaim stays as the
  zkTLS proof source that the 0G agent verifies.
- Adapters stay generic (`IStorageProvider`, `IOracle`, `IPaymentRail`) with
  only the three-sponsor implementations.
- World ID v4: `POST /api/rp-signature` signs the RP request on the server with
  `@worldcoin/idkit-core/signing` (the browser never signs). Verify with
  `POST https://developer.world.org/api/v4/verify/{rp_id}` on the server. The
  nullifier is saved in Postgres and on the factory contract to block double
  IPOs and flag defaulters. The playbook asks for `@worldcoin/idkit` ^4.x, which
  is React-only; SMX has no React (no Next.js), so the browser uses
  `@worldcoin/idkit-core` ^4.x, the same v4 SDK without React bindings.
- Hedera: creator equity token minted with the Hedera Asset Tokenization
  Studio (ATS) SDK. Dividends use the x402 payment loop: when the 0G agent
  approves a dividend, the creator's browser signs a Hedera transfer that pays
  holders (micro-streams). Native Hedera transactions only.
- 0G: the auditor agent (verifies the Reclaim proof, approves or denies) runs on
  0G Compute. L-ISA legal parameters and every approve/deny log go to the 0G
  Storage Log Layer. Safe-stop fallback: when a creator misses a proof deadline,
  the 0G agent freezes the Hedera escrow (`freezeEscrow`), and unfreezes on a
  late approved proof; liquidation still follows after grace.
- "Next.js route" in the playbook maps to an Express OpenAPI route here.

## Workstreams

| # | Workstream | Owner files | Status |
| --- | --- | --- | --- |
| 1 | Foundation: monorepo, app skeleton from Builder, client pkg, Docker, CI | root configs, `packages/app` infra, `packages/client` | Done |
| 2 | Contracts | `packages/contracts/**` | Done |
| 3 | Integration research + docs + Arkiv files | `docs/integrations/**`, `arkiv/**`, `README.md` | Done |
| 4 | Backend domain: OpenAPI, SQL, mutation routes, worker | `openapi.yaml`, `sql/**`, `src/routes/` (POST), `src/worker/**` | Done |
| 5 | Integrations code | `packages/app/src/integrations/**`, `src/client/{wallet,world-id,reclaim}.ts` | Done |
| 6 | UI: pages, components, CSS, client JS | GET routes, `src/components/**`, `public/styles/**` | In progress |
| 7 | Adapter refactor + MVP sponsor focus + Reclaim client switch + mock bank login | `src/integrations/**`, `src/services/**`, mutation routes, worker, `GetMockBank`, mock bank API | In progress |
| 8 | Reclaim provider via MCP (mock bank), callback proxy, end-to-end proof | Main session (needs developer) | Todo |

Workstream 8 note: Mock bank login ready: `GET http://localhost:4020/mock-bank/login` (form, any non-empty username/password), `POST /mock-bank/login` (sets httpOnly `smx_bank_session`, 303 to `/mock-bank`), `GET /mock-bank` (statement page; redirects to login without cookie; fetches the API), `GET /mock-bank/api/transactions` (JSON `{account, holderName, balance, transactions[]}`, 401 without cookie; the auth-bound request to prove). Code: `packages/app/src/services/mock-bank.ts`.

## Done

- Spec, pitch, engineering guide in `docs/`.
- Workstream 2: `packages/contracts` (Hardhat 3, viem, node:test) compiles and 3 tests pass. No deployed addresses yet. Commands: `npm run build` (compile + ABIs to `src/abis.gen.ts`), `npm test`, `npm run node`, `npm run deploy:{hedera,sepolia,0g}`. Docs in `docs/contracts.md`. Package has a temporary local `package-lock.json`.
- Workstream 3: seven integration guides in `docs/integrations/` (index in `docs/integrations/README.md`), `arkiv/schema.md`, `arkiv/friction.md`, root `README.md`, `docs/README.md`. Package versions verified on npm 2026-11-06: `@worldcoin/idkit-core` 4.6.0, `@reclaimprotocol/js-sdk` 5.8.3, `@x402/core` + `@x402/hedera` 2.30.0, `@0gfoundation/0g-compute-ts-sdk` 0.9.0, `@0gfoundation/0g-storage-ts-sdk` 1.2.13, `@chainlink/cre-sdk` 1.23.0, `@arkiv-network/sdk` 1.0.1.

- Workstream 5: all six integration modules and the three browser modules are implemented with demo fallbacks. `npm run check`, `lint:fix`, `node --test tests/integrations.test.ts` (9 tests) and `npm run build` pass. `chain.ts` was also run for real against a local Hardhat node (createISA, initializeIPO, invest, distributeDividend, unlockNextTranche, executeLiquidation, revert -> FAILED). The other sponsors were not run live (no keys).

- Workstream 1: Builder-style monorepo skeleton. `npm install`, `gen:check`, `check`, `lint`, `test`, `build` and `npm run dev` (http://localhost:4020, `/healthz`, styled `/`) all verified on 2026-11-06. One initial migration (`packages/app/migrations/20261106105127299.init.sql`) holds the base schema only.

## How to run

```bash
nvm use                   # Node 24
npm install
cp .development.env .env  # already present after bootstrap; edit as needed
npm run dev               # PGlite dev server at http://localhost:4020
```

- Real Postgres (pg_cron, PGTyped): `npm run db:up` (host port 5442), then `npm run gen` or `npm run pgtyped:typegen`. Stop with `npm run db:down`.
- Full stack in containers: `docker compose up --build` (app on 4020, Postgres on 5442).
- Schema change: edit `packages/app/sql/ddl.sql`, run `npm run migrate:plan`, then `npm run pgtyped:typegen`. If `packages/app/migrations/` already exists the planner diffs against it (the first plan only worked after the empty folder was deleted).
- New route: see `packages/app/AGENTS.md`. `npm run openapi:gen --workspace=packages/app` regenerates `packages/client/src/{types/openapi.gen,routes.gen}.ts`.
- Before reporting done: `npm run gen:check && npm run check && npm run lint:fix && npm test`.
- Reset the dev database: `npm run dev -- --clear` (or delete `packages/app/pg_dev_data`).

## Skeleton map

Reusable pieces for workstreams 4 to 6. All paths are under `packages/app/` unless noted.

Server and infra:
- `src/app.ts` `createApp(pg)`: CORS, `/healthz`, Better Auth mount at `/auth`, parsers, pino-http, static `/public`, Vite (dev), OpenAPI validator and route resolver, ErrorPage, problem+json errors.
- `src/consts.ts`: env constants (`APP_NAME`, `DEMO_MODE`, `PORT`, `canonicalOrigin()`, `assetUrl()`). Add new env vars here.
- `src/auth.ts`: `resolveViewer`, `requireAuth`, `relaySetCookies`. `req.authMetadata` is `{ id, email, name, walletAddress }`.
- `src/better-auth.ts`: Better Auth with SIWE (viem `verifyMessage`) and bearer. Flow: `POST /auth/siwe/nonce`, sign, `POST /auth/siwe/verify`. Wallet rows live in `smx.wallet_addresses`.
- `src/pgmb.ts`: `createPgmbClient`, `getPgmbClient`, `useAppSchema(pg)`. `src/worker/register.ts` `runWorkers`: empty consumer list; add consumers here.
- `src/db.ts`: `initPgPool`, `initPgmbPool` (search_path=smx, UTC). `src/otel.ts`: OpenTelemetry.
- `tests/utils.ts` `bootApp()`, `tests/pglite.ts` `createSeededPglite()`. `scripts/`: `dev.ts`, `start.ts`, `migrate.ts`, `openapi-typegen.ts`, `routes-gen.ts`, `check-gen.ts`, `gen-stamp.ts`, `warm-test-snapshot.ts`.
- `sql/ddl.sql` base: schema `smx`, domains `safe_url`, `email_address`, `money_amount`, `token_amount`, `evm_address`, `tx_hash`; `touch_updated_at()` trigger; `raise_error(status, msg)` and `assert_that(ok, status, msg)` (SQLSTATE `H0<status>`, mapped by `mapError`); `user_wallet(user)`; Better Auth tables.

Utils (`src/utils/`):
- `map-error.ts` `mapError`, `mapPgError`. `negotiation.ts` `shouldSendJson`, `wantsFragment`. `http.ts` `sendOrRedirect`, `sendJson`, `encodeUpdatedCursor`/`decodeUpdatedCursor`, `withQueryParams`.
- `escape.ts` `escapeText`, `markup`, `trustedHtml`, `jsonForScript`. `client-assets.ts` Vite manifest resolution.
- `money.ts` `formatUsdc`, `formatTokens`, `shortHex`. `dates.ts` `formatDate`. `plural.ts`. `tones.ts` `BadgeTone`, `statusTone`.

Components (`src/components/`):
- Shell: `Layout` (`seo`, `viewer`, `nav`, `bare`), `IndexHtml`, `Header` (edit `NAV_ITEMS`), `PublicShell`, `nav-swap.ts` (`navLink`).
- Display: `Icon`, `Avatar`, `Badge`, `Tag`, `Kpi`, `Progress`, `SectionCard`, `PageHeader`, `EmptyState`, `Notice`, `DataTable`, `Breadcrumbs`, `CodeBlock`, `CopyButton`, `CopyField`, `Hint`, `NumberedStep`, `ExpandableCard`, `BlockingWarning`, `ActionMenu`.
- `dialog/` (`Dialog`, `DialogCloseButton`), `forms/` (`HxForm`, `Field`, `FormError`, `SearchInput`).
- `charts/`: `AreaChart`, `BarChart`, `BarList`, `ChartFrame`, `ChartPlot`, `Legend`, `labels.ts`, `segments.ts`.
- Client (`src/client/`): `index.ts` boots htmx (response-targets, sse, `json-enc`) and toasts on htmx errors; `behaviors.ts` calls `initReclaimBehaviors` and localizes `<time data-local-time>`. Add feature modules as `import './x.ts'` in `index.ts`.
- Routes: `ErrorPage` plus the domain routes in the Backend map (`GetHome` was replaced by `GetExchange`).

`packages/client`: `Client.call(operationId, { params, query, body })` from `@stakeme/client/api`.

## Integrations map

Code: `packages/app/src/integrations/` (import from `index.ts`), browser hooks in `src/client/{wallet,world-id,reclaim}.ts` (+ `web3-util.ts`). Env constants are in the "Integrations" section of `src/consts.ts`; placeholders in `.development.env`. Data-attribute contract for the UI: [`docs/frontend-hooks.md`](docs/frontend-hooks.md).

| Sponsor | Env vars | Demo fallback (LOGGER warns) |
| --- | --- | --- |
| World ID | `WORLD_APP_ID`, `WORLD_RP_ID`, `WORLD_RP_SIGNING_KEY`, `WORLD_ACTION`, `WORLD_ENV` | Fixture proofs (`demo: true`), `DEMO_MODE=1` only. Deterministic nullifier; "Simulate Sybil" repeats it. |
| Reclaim | `RECLAIM_APP_ID`, `RECLAIM_APP_SECRET`, `RECLAIM_PROVIDER_ID` | `demoIncomeProof(context, amount)` fixture, `DEMO_MODE=1` only. Demo session links to `/mock-bank`. |
| 0G | `ZG_PRIVATE_KEY`, `ZG_RPC_URL`, `ZG_INDEXER_URL`, `ZG_PROVIDER_ADDRESS`, `ZG_LEDGER_DEPOSIT` | Rules engine (`model: 'rules-engine'`), `logRef = local:<sha256>`. Also used when Compute errors. |
| Arkiv | `ARKIV_PRIVATE_KEY`, `ARKIV_ACCESS_KEY` | `entityKey = local:<termsHash>`; `termsHash` is sha256 of canonical JSON. |
| Chain | `CHAIN_RPC_URL`, `CHAIN_ID`, `ORACLE_PRIVATE_KEY`, `FACTORY_ADDRESS` | `CHAIN_RPC_URL` unset: SIMULATED, tx hash = keccak256(job id), fake ISA/token addresses. |
| Hedera | `HEDERA_OPERATOR_ID`/`HEDERA_ACCOUNT_ID`, `HEDERA_OPERATOR_KEY`/`HEDERA_PRIVATE_KEY`, `HEDERA_DIVIDEND_TOKEN_ID`, `HEDERA_NETWORK` | SIMULATED `sim:0x...` receipts. |

Extra exports routes should use (all re-exported from `integrations/index.ts`, additive):
- `createWorldIdRequest(signal)`: expose as `POST /api/world-id/rp-signature` (default URL the browser calls; read `signal` from the SIWE session wallet, never the body). Returns `{ rpContext, appId, action, environment, signal, demo }`.
- `demoIncomeProof(context, amount)`, `demoWorldIdProof(kind, nonce)`: fixtures (the browser builds identical ones).
- `isWorldIdConfigured()` lives in `world-id.ts` (not re-exported): render `data-app-id` only when true.

`ChainJob.args` shapes `chain.ts` reads (amounts are USDC decimal strings, parsed with 6 dp):
- `createISA`: `{ name, ticker, totalRaise, creatorStake, shareBps, termMonths, trancheBps?, worldIdNullifier | worldIdNullifierHash }`; `contractAddress` = factory (or `FACTORY_ADDRESS`).
- `invest` / `distributeDividend`: `{ amount }`; `initializeIPO`, `unlockNextTranche`, `executeLiquidation`: no args. `contractAddress` = the ISA.
- Testnet simplification: the oracle key signs everything and mints/approves MockUSDC as needed (Arc/EIP-3009 relayer shortcut).

Rules: `verifyIncomeProof` does not dedupe; store `proofId` under a unique index and reject repeats. `createReclaimSession` takes an absolute `callbackUrl`. Browser demo posts for Reclaim use body key `proof` (configurable).

## Backend map

Workstream 4, done 2026-11-06. Full guide: [`docs/backend.md`](docs/backend.md). Paths under `packages/app/`.

- Tables: `creators`, `tranches`, `investments`, `holdings`, `pools`, `trades`, `price_ticks`, `income_proofs`, `dividends`, `payouts`, `oracle_events`, `chain_jobs`, `blacklisted_nullifiers`. One migration: `migrations/20261106111202382.domain.sql` (two manual `SET` header lines; see its comment). To re-plan after a `ddl.sql` change, delete the domain migration, run `npm run migrate:plan`, rename, and keep the header.
- SQL functions (`sql/ddl.sql`): `launch_ipo`, `record_investment`, `amm_swap`, `submit_income_proof`, `audit_income_proof`, `pay_dividend`, `sweep_deadlines`, `liquidate_creator`, `complete_chain_job`, `emit_oracle_event`, `demo_trigger_default`, `demo_spread_history`; JSON builders `creator_json`, `creator_summary_json`, `exchange_json`, `creator_page_json`, `creator_hub_json`, etc. Queries in `sql/queries.sql`.
- Routes (`src/routes/`): GetExchange (`/`), GetCreator, GetCreatorHub, GetLaunch, GetMockBank, LaunchIpo, Invest, Trade, CreateReclaimSession, ReclaimCallback, AuditMilestone, TriggerDefault, PayDividend, StreamEvents. All GET pages already load data and return JSON on negotiation; mutations use `utils/mutation.ts` `respondMutation` (htmx 204 + `HX-Trigger`/`HX-Redirect`, JSON 201). Types: `src/types/domain.ts` (schema aliases).
- Worker (`src/worker/`): chain jobs (pgmb wake-up, boot drain, 15 s poll), dividend streaming on `DIVIDEND_PAID`, deadline sweep timer (`SWEEP_INTERVAL_S`).
- SSE `GET /events`: `oracle-event` (HTML from `components/events/OracleEventItem.tsx`), `oracle-event-json`, `chain-job` (JSON `{id, creatorId, fn, status, txHash}`). `?ticker=` filters.
- Page components for workstream 6 to flesh out (`src/components/pages/`, props are OpenAPI types from `src/types/domain.ts`): `ExchangePage({ exchange: Exchange })`, `CreatorPage({ page: CreatorPage })`, `CreatorHubPage({ hub: CreatorHub })`, `LaunchPage({ state: LaunchState })`, `MockBankPage({ bank: MockBank })`, plus `OracleEventItem({ event: OracleEvent })`. Each is a minimal placeholder; handlers need no change. Mutation endpoints the UI calls: see `docs/backend.md` routes table. `Creator.chain.pendingJobs > 0` means show the pending badge until a `chain-job` SSE event.
- Seed: `npm run seed:demo` (PGlite by default, `-- --pg` for Docker Postgres). Seed before `npm run dev`; PGlite is single-process. Tests: `tests/domain.test.ts` (4 describes).

## Remaining

- Workstream 6 (UI) in the table above.
- Backend: no `Last-Event-ID` replay on SSE; no e2e test for `AuditMilestone`; `DRAFT` creator status unused; Arkiv entity extension not scheduled in the worker.

## Known issues

- Foundation (workstream 1):
  - `@reclaimprotocol/design` is pinned to the latest commit `60641e29` (Builder pins `291e295`). It builds and serves fine.
  - `@adiwajshing/eslint-config` must stay on commit `607fc28f` (newer commits switched to oxlint and break `eslint.config.js`).
  - Root ESLint disables `max-len` for `packages/contracts/**/*.ts` (their scripts and tests exceed 80 columns). Contracts files were not edited.
  - Vite warns about htmx's direct `eval` at build time. Harmless; it is htmx's own code.
  - Dev and tests use PGlite, where `pg_cron` is disabled (pgmb logs `isPgCronEnabled: false`). Use `docker compose up` to exercise real pgmb scheduling.
  - SIWE users get a placeholder email (`siwe` namespace) because Better Auth requires one. The SIWE `anonymous` option is on.
  - `OpenApiSpec`/`/docs` routes, MCP/agent package, billing, orgs, analytics and every other Builder domain feature were removed, not stubbed.
  - Docker image build and `docker compose up --build` were not run (CI-only paths). The CI workflow is `.github/workflows/ci.yaml`.
- Contracts: share-token dividend payouts can be 1 base unit short (floor rounding). Unverified on live testnets; solc needs `viaIR`.
- Integrations (workstream 3 research, 2026-11-06):
  - Arc has no paymaster RPC. USDC is native gas (18 decimals native, 6 on the ERC-20 interface at `0x3600...0000`). Gasless needs an EIP-3009 relayer or ERC-4337 paymaster we run. The spec's "Arc paymaster RPC" line is wrong. Not verified whether the testnet USDC supports `transferWithAuthorization`.
  - Hedera x402 (`@x402/hedera`) pays HBAR or HTS tokens via native Hedera transactions with a facilitator as fee payer. It doesn't move EVM ERC-20 USDC. Dividend streaming is an HTS rail or simulated. Facilitator: `https://x402.org/facilitator` (`hedera:testnet`).
  - Chainlink CRE TypeScript lists Ethereum Sepolia and Arc Testnet but not Hedera or 0G Galileo. CRE writes go through a `KeystoneForwarder` to a consumer contract implementing `IReceiver`. `LiquidISA`'s oracle must be such a receiver for a real CRE run (contracts owner to decide). The sample workflow in the doc is a design sketch, not compiled. Deploying needs CRE access, so plan on simulation only.
  - World ID is 4.0: use the `/api/v4/verify/{rp_id}` endpoint and an RP signing key (`WORLD_RP_ID`, `WORLD_RP_SIGNING_KEY`). Staging actions verify only in the Simulator. `@worldcoin/idkit` is React only, so use `@worldcoin/idkit-core`. Nullifiers are 256-bit: store as `NUMERIC(78,0)` or text.
  - 0G: `@0glabs/*` packages are deprecated; use `@0gfoundation/*`. Both SDKs need `ethers` v6. Minimum compute ledger deposit not verified.
  - Reclaim: a newer Builder API (`@reclaimprotocol/client` 0.1.43) exists; SMX docs use `js-sdk`. Provider creation needs a public HTTPS `/mock-bank` JSON endpoint (tunnel in dev). Unverified whether `toJsonString()` includes the app secret: don't send it to the browser until checked.
  - Arkiv: entities live at most about 182 days per write, so the worker must call `extendEntity` about every 150 days. Needs an access key and tGLM from the Arkiv hub. Could not find the official prize wording online. We kept `/arkiv/schema.md` and `/arkiv/friction.md` at repo root as the pitch playbook says. Re-check the ETHGlobal prize page for any extra required file (for example a README section).
  - Hashio (Hedera relay) is development-only and can throttle.
- Integrations (workstream 5):
  - Live sponsor paths (World ID, Reclaim, 0G, Arkiv, Hedera) are typechecked against package types but unrun; only chain and the demo paths are proven.
  - `terms_hash` is sha256, not keccak (changed `arkiv/schema.md` to match).
  - Hedera uses direct HTS transfers, not x402 (operator pays fees). 0G `ethers` is duplicated (storage SDK pins 6.13), so two casts bridge the types.
  - The routes the browser calls (`/api/world-id/rp-signature`, the Reclaim session route, `/api/audit-milestone`) are owned by workstream 4; none exists yet.
  - `npm install` of the new deps also updated `package-lock.json`.
- Backend (workstream 4):
  - `POST /api/world-id/rp-signature` (used by `client/world-id.ts`) is NOT implemented: it isn't in the spec routes table. It needs an OpenAPI operation plus a thin route over the signing helper in `integrations/world-id.ts`. `GetLaunch` only returns `WORLD_APP_ID`, `WORLD_RP_ID`, `WORLD_ACTION`.
  - `npm run dev` always uses PGlite (it ignores `DB_URI`); `seed:demo` must run while the dev server is stopped. A dev-server `--seed` flag would be nicer but `scripts/dev.ts` isn't ours.
  - The sweep may move seeded `RAHUL` to `GRACE` within `SWEEP_INTERVAL_S` seconds; `TriggerDefault` works from `LIVE` or `GRACE`.
  - AMM liquidity is virtual (10% of the target, minimum 100 USDC, price 1.0); it is not backed by investor funds.
  - Chain jobs are never retried after `SENT`; a failure needs manual requeue.
  - pg_cron is not used: the sweep is one in-process timer protected by `SKIP LOCKED`.
