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
| 6 | UI: pages, components, CSS, client JS | GET routes, `src/components/**`, `public/styles/**` | Done |
| 7 | Adapter refactor + MVP sponsor focus + Reclaim client switch + mock bank login | `src/integrations/**`, `src/services/**`, mutation routes, worker, `GetMockBank`, mock bank API | Done |
| 8 | Reclaim provider via MCP (mock bank), callback proxy, end-to-end proof | Main session | Provider live; e2e session test pending |
| 9 | Hedera financial engine: ATS equity token, freeze/unfreeze escrow, x402 dividend loop | `packages/contracts/**`, `integrations/{chain,hedera-ats}.ts`, `services/payment/hedera-*.ts`, `client/hedera-pay.ts`, `docs/integrations/hedera.md` | Done |

Workstream 8 note: Mock bank login ready: `GET http://localhost:4020/mock-bank/login` (form, any non-empty username/password), `POST /mock-bank/login` (sets httpOnly `smx_bank_session`, 303 to `/mock-bank`), `GET /mock-bank` (statement page; redirects to login without cookie; fetches the API), `GET /mock-bank/api/transactions` (JSON `{account, holderName, balance, transactions[]}`, 401 without cookie; the auth-bound request to prove). Code: `packages/app/src/services/mock-bank.ts`.

Workstream 8 status (2026-11-06):
- Provider `3fefebae-05cb-4d6b-b319-f3f639a31201` ("SMX Mock Bank Deposit", PRIVATE, live v0.1.1) in org `73351799-e315-4b65-bb8e-4df3496c7ec5`. Built with the Reclaim MCP: capture → draft → replay (200 signed in, 401 without cookie: auth-bound) → `run_proof` verified (`amount` 5000.00, `deposit_date`) → publish. `RECLAIM_PROVIDER_ID` is set in `.env`.
- Extracted params: `amount`, `deposit_date` (`$.transactions[0]`). The mock bank dates the withdrawal a day earlier so the deposit date is unique, and its statement fetch uses `referrerPolicy: 'no-referrer'` (the attestor can't redact a Referer that repeats the URL).
- Result encryption is OFF for the org (`canEncryptResult: false`), so `RECLAIM_ORG_ETH_PRIVATE_KEY` is optional.
- `run_proof` created a local proof-signing test key `RECLAIM_PRIVATE_KEY` in `.env` (gitignored).
- Hosting: the provider URL is a cloudflared quick tunnel (`https://history-cheers-extra-plan.trycloudflare.com` → local port 4030). Quick-tunnel URLs change on restart; then a new provider version is needed. For the stage demo, move the mock bank to a stable host (named tunnel or deploy) and publish a new version with that URL.
- Dev `allowedHosts` in `src/app.ts` includes the `CANONICAL_ORIGIN` host so Vite accepts the tunnel's Host header.
- Remaining: forward callbacks with MCP `proxy_callback_events({ port, path: '/reclaim/callback' })`, create a session from the Hub, sign in on the hosted verification page, and confirm `PROOF_VERIFIED` arrives.

## Done

- Spec, pitch, engineering guide in `docs/`.
- Workstream 2: `packages/contracts` (Hardhat 3, viem, node:test) compiles and 3 tests pass. No deployed addresses yet. Commands: `npm run build` (compile + ABIs to `src/abis.gen.ts`), `npm test`, `npm run node`, `npm run deploy:{hedera,sepolia,0g}`. Docs in `docs/contracts.md`. Package has a temporary local `package-lock.json`.
- Workstream 3: seven integration guides in `docs/integrations/` (index in `docs/integrations/README.md`), `arkiv/schema.md`, `arkiv/friction.md`, root `README.md`, `docs/README.md`. Package versions verified on npm 2026-11-06: `@worldcoin/idkit-core` 4.6.0, `@reclaimprotocol/js-sdk` 5.8.3, `@x402/core` + `@x402/hedera` 2.30.0, `@0gfoundation/0g-compute-ts-sdk` 0.9.0, `@0gfoundation/0g-storage-ts-sdk` 1.2.13, `@chainlink/cre-sdk` 1.23.0, `@arkiv-network/sdk` 1.0.1.

- Workstream 5: all six integration modules and the three browser modules are implemented with demo fallbacks. `npm run check`, `lint:fix`, `node --test tests/integrations.test.ts` (9 tests) and `npm run build` pass. `chain.ts` was also run for real against a local Hardhat node (createISA, initializeIPO, invest, distributeDividend, unlockNextTranche, executeLiquidation, revert -> FAILED). The other sponsors were not run live (no keys).

- Workstream 6 (UI, 2026-11-06): Exchange, Creator page, Hub, Launch built (server-rendered TSX, htmx, light/dark, 390px). `npm run check` passes; `lint:fix` passes except `tests/services.test.ts:52` (workstream 7). Components added (`src/components/`):
  - `charts/Sparkline` row trend line; `charts/PriceChart` framed area chart with price ticks.
  - `PriceChange` signed green/red 24h change; `CreatorStatus` (`CreatorStatusBadge`, `isEscrowFrozen`: GRACE or last ESCROW_FROZEN event).
  - `Countdown` ticking `<time data-countdown>`; `ChainJobBadge` + `PendingChainBadge` (flipped by `chain-job` SSE); `TxLink`/`HashRef` shortened hash + Copy (explorer: hashscan testnet).
  - `Header` rewritten: brand, Exchange/Hub/Launch, theme toggle, "Launch your IPO" CTA, `data-wallet-connect` button, `.rc-bottom-tabs` below 900px. Anonymous Hub/Launch links sign in via wallet, then redirect.
  - Pages: `ExchangePage`, `CreatorPage`, `CreatorHubPage`, `LaunchPage` (fleshed out). `OracleEventItem` restyled (ESCROW_FROZEN/UNFROZEN supported). `DataTable` columns take `col` (`data-col`, hidden under 560px).
  - Client: `src/client/live.ts` (toasts on HX-Trigger events, chain-job badges, `smx:oracle-event` region reloads, countdown tick, form reset) and `src/client/launch-form.ts` (turns `worldIdProof` into an object and share % into `shareBps` for the JSON body). CSS: `public/styles/smx.css`.
  - Hub renders the x402 Hedera button + `<output data-hedera-pay-status>` per scope update 2; Reclaim start/demo buttons per `docs/frontend-hooks.md`.
  - Screenshots (chrome-devtools, light/dark, 1280px and 390px) of `/`, `/creators/MUSH`, `/creators/RAHUL` (defaulted: danger notice), `/hub`, `/launch` looked right after fixes (bottom tabs pinned, KPI grid single column under 560px, tranche list alignment). Burner sign-in and the full Launch flow (World ID simulate -> IPO -> redirect) worked.
- Workstream 1: Builder-style monorepo skeleton. `npm install`, `gen:check`, `check`, `lint`, `test`, `build` and `npm run dev` (http://localhost:4020, `/healthz`, styled `/`) all verified on 2026-11-06. One initial migration (`packages/app/migrations/20261106105127299.init.sql`) holds the base schema only.

- Workstream 9 (2026-11-06): Hedera financial engine. Details in [`docs/integrations/hedera.md`](docs/integrations/hedera.md).
  - Contracts: `LiquidISA.freezeEscrow/unfreezeEscrow` (oracle only; frozen blocks `unlockNextTranche`, `reclaimStake`, and the auto tranche-0 release; claims and liquidation still work), `setAtsToken`. Factory already stores `isaOfNullifier` and the blacklist. 4 tests pass.
  - ATS decision: `@hashgraph/asset-tokenization-sdk` 8.0.0 has no private-key signer (WalletConnect, MetaMask, DFNS, Fireblocks, AWS KMS only) and its ESM build isn't Node-loadable, so `integrations/hedera-ats.ts` calls the ATS `Factory.deployEquity` + `Equity.mint` with viem. The ATS token MIRRORS the cap table; `CreatorShareToken` stays the escrow/dividend source of truth (an ATS token can't reuse the ISA's O(1) dividend math). Wired into the `createISA` chain job (`deployed.atsToken`). Behind `ATS_ENABLED=1` + `ATS_FACTORY_ADDRESS` + `ATS_RESOLVER_ADDRESS`; SIMULATED otherwise or on error. Not run against a live ATS deployment.
  - x402 loop: `HederaPaymentRail` is the default rail. `createPaymentRequest` returns one x402 requirement per holder; the creator signs ONE multi-transfer tx; the server rebuilds requirements from SQL, checks transfers, adds the operator fee-payer signature and executes with `@hiero-ledger/sdk` (the stock `exact` facilitator verifies a single payee, so it isn't used). Pure builder + validator: `services/payment/hedera-payment-requirements.ts` (tested in `tests/hedera-payment.test.ts`). Browser: `client/hedera-pay.ts` (burner ECDSA key, lazy Hiero SDK chunk ~1.9 MB). Removed `integrations/hedera-x402.ts`.
  - Env: `HEDERA_OPERATOR_ID`, `HEDERA_OPERATOR_KEY`, `HEDERA_NETWORK`, `HEDERA_DIVIDEND_TOKEN_ID` (unset = HBAR, 1 USDC = 0.01 HBAR), `HEDERA_RPC_URL`, `ATS_ENABLED`, `ATS_FACTORY_ADDRESS`, `ATS_RESOLVER_ADDRESS`, `ATS_CONFIG_VERSION`.

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
| Reclaim | `RECLAIM_ORG_SECRET`, `RECLAIM_PROVIDER_ID`, `RECLAIM_ORG_ETH_PRIVATE_KEY` (optional; org encryption is OFF) | `demoIncomeProof(context, amount)` fixture, `DEMO_MODE=1` only. Demo session links to `/mock-bank`. |
| 0G | `ZG_PRIVATE_KEY`, `ZG_RPC_URL`, `ZG_INDEXER_URL`, `ZG_PROVIDER_ADDRESS`, `ZG_LEDGER_DEPOSIT` | Rules engine (`model: 'rules-engine'`), `logRef = local:<sha256>`. Also used when Compute errors. |
| Storage | `STORAGE_PROVIDER=0g\|local` (default `0g`), `ZG_*` | Without `ZG_PRIVATE_KEY` or on upload failure: `LocalStorageProvider`, ref `local:<sha256>`. |
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

## Adapter map (workstream 7, done 2026-11-06)

Docs: [`docs/architecture-adapters.md`](docs/architecture-adapters.md) (class diagram). Code under `packages/app/src/services/`; routes and workers import only from `services/index.ts`.

| Interface | Default | Factory / switch |
| --- | --- | --- |
| `IStorageProvider` (`putJson({kind, key, data, attributes}) -> {ref, contentHash}`) | `ZeroGravityStorage` inside `FallbackStorage`, then `LocalStorageProvider` | `createStorageProvider()`; env `STORAGE_PROVIDER=0g\|local`; no `ZG_PRIVATE_KEY` gives local. |
| `IOracle` (`createProofRequest`, `fetchVerifiedIncome`, `getProofRequestStatus`) | `ZeroGravityAgent` (also `audit()` on 0G Compute, log written through the storage provider) | `createOracle()`; `OracleDecorator` wraps another oracle. |
| `IPaymentRail` (`payout`, optional `createPaymentRequest`, `settle`) | `HederaPaymentRail` (workstream 9) | `createPaymentService(pg)` / `createPaymentRail()`. `PaymentService` takes splits from SQL, checks they sum, records receipts. |

- New implementation: add a class, return it from the factory. No other file changes.
- Refs in Postgres: `creators.terms_ref` (L-ISA terms, 0G root hash or `local:`), `income_proofs.audit_log_ref` (every APPROVED/DENIED audit log).
- Safe stop: `sweep_deadlines` LIVE->GRACE calls `freeze_escrow` (event `ESCROW_FROZEN`, chain job `freezeEscrow`); a late approved proof in GRACE emits `ESCROW_UNFROZEN` and queues `unfreezeEscrow`. `creators.ats_token_address` (JSON `atsTokenAddress`) is stored by `complete_chain_job`.
- World ID: `POST /api/rp-signature` (`CreateRpSignature`, signal = SIWE wallet). `createISA` job args now include `worldIdNullifier` and `termsRef`.
- API surface added: `GetMockBankLogin`, `MockBankLogin`, `GetMockBankTransactions`, `GetReclaimSessionStatus`, `CreateRpSignature`, `CreateDividendPaymentRequest`; `PayDividend` takes optional `{ paymentPayload }`.
- JSON change: creator `arkivEntityKey` is now `termsRef` (CreatorPage updated).
- One migration: `migrations/20261106114000000.adapters.sql` (hand-edited: rename `arkiv_entity_key` -> `terms_ref`). New table `reclaim_sessions`, column `income_proofs.reclaim_session_id`.

### Reclaim client flow

`@reclaimprotocol/client` 0.1.43 (js-sdk removed). Env: `RECLAIM_ORG_SECRET`, `RECLAIM_PROVIDER_ID`, `RECLAIM_ORG_ETH_PRIVATE_KEY` (optional: org result encryption is OFF, results are plaintext; passed only when set). `CreateReclaimSession` -> `sessions.create` (context `{creatorId, ticker}`), row in `reclaim_sessions`. Callback: `POST /reclaim/callback` on port 4020; it looks up the session by the envelope `sessionId` and calls `results.receive` with `reclaimSessionId` and `expectedAud` from the DB. `ResultVerificationError`: `retryable` -> 503, else 200. Failure events set session status and `failure_reason`. Polling fallback `GET /reclaim/sessions/{sessionId}`. The provider must expose the deposit as extracted parameter `amount`, `deposit_amount`, `depositAmount` or `income`.

Known issues (workstream 7): live Reclaim/0G/World ID paths are untested (no live callback yet); `npm install` nested a stale `@types/node@18` into `packages/app/node_modules/@types/node` (moved aside; reinstalling may recreate it and break `tsc`); lint/tsc errors in `ChainJobBadge.tsx`, `CreatorHubPage.tsx`, `CreatorPage.tsx` come from the UI agent's in-progress files; `docs/pitch.md`, `docs/product-spec.md` still mention Arkiv/Chainlink; unauthenticated failure events can end a pending session (low risk: ids are random).

## Wallets (WalletConnect, 2026-11-06)

Env: `WALLETCONNECT_PROJECT_ID` (public; from https://dashboard.walletconnect.com, the origin must be allowlisted there). The server renders it as `<meta name="smx-walletconnect-project-id" data-name data-description data-url data-icon>` in `Layout` (`data-url` is `CANONICAL_ORIGIN`). Docs: `docs/frontend-hooks.md`, `docs/integrations/hedera.md`.

- EVM sign-in (SIWE via Better Auth), `client/wallet.ts`: the Connect button opens `#wallet-dialog` with, in order, **Connect with WalletConnect** (only with a project id; QR plus mobile deep links; 1inch Wallet featured first), **Generate a new wallet** (local key in `localStorage` `smx.burnerKey`, reused if saved), **Import a key**; plus **Browser extension** only when `window.ethereum` exists. SDK: `@reown/appkit-universal-connector` 1.8.24 (the vanilla path in the WalletConnect App SDK docs), wrapped as EIP-1193 for viem `custom()`; chain Hedera testnet EVM 296 (Hashio). 1inch's wallet id comes from the explorer API (`search=1inch`), not hard-coded.
- Hedera payment signer, `client/hedera-pay.ts`: live mode opens `#hedera-signer-dialog` with the same three choices: WalletConnect (`@hashgraph/hedera-wallet-connect` 2.1.3 `DAppConnector`, `hedera:testnet`; HashPack, Kabila; 1inch doesn't support Hedera native), generate, or import an ECDSA key (`smx.hedera.burner`). The payer is the connected account; the server derives it from the signed transfers, so `hedera-payment-*.ts` is unchanged.
- Export: a generated or imported key can be revealed and copied (`client/key-export.ts`, `#key-export-dialog`): header "Export key" for the sign-in key, and in the Hedera dialog.
- No silent fallback: closing the WalletConnect modal, closing the dialog or a wallet rejecting aborts with "Connection cancelled" (or the wallet's error): no key is generated, nothing is stored, no SIWE request is sent. A key exists only after the user picks Generate or Import. Without a project id the WalletConnect option is hidden and the dialog still offers Generate and Import.
- Sign-out (`[data-wallet-signout]` in the header): `POST /auth/sign-out`, ends the EVM and Hedera WalletConnect sessions, clears the stored address, goes to `/`. The local key is kept on purpose.
- Lazy chunks (own Vite chunks): EVM WalletConnect about 1.1 MB (315 KB gzip), Hedera WalletConnect about 1.3 MB (195 KB gzip) on top of the existing Hiero SDK chunk. Main entry about 141 KB (41.5 KB gzip).
- npm: root `overrides` force `@hiero-ledger/sdk` ^2.90.1 (the wallet package pins 2.79.0 as an exact peer), `ethers` ^6.13.1 under the wallet package (peer ^6.13.5; the 0G SDK pins 6.13.1) and a single `@types/node` (`$@types/node`; this also stops the stale `@types/node@18` nesting under `packages/app`).
- Known issues: the two SDKs use different WalletConnect storage prefixes (`smx-evm` and the default) because the Hedera `DAppConnector` throws on a stored session without a `hedera` namespace. `UniversalConnector.connect()` never settles when the modal closes, so `walletconnect-evm.ts` watches the modal state through a private field (`appKit`, cast) and aborts the pairing. Not verified live: a full pairing and signature (needs a phone wallet), HashPack accepting a transaction whose fee payer is the SMX operator, mobile deep-link return after the SIWE request, the Hedera signer dialog (needs a live `HEDERA_OPERATOR_*` rail; the dev server is simulated). Verified in Chrome with the real project id: the QR modal opens, the explorer lookup found 1inch Wallet, close-without-connect stores nothing, generate, import, export, sign-out.

## Remaining

- UI follow-ups for workstream 7: `GetExchange` has no totals, so the "Dividends paid" KPI sums `DIVIDEND_PAID` events in the latest 20 (shows $0.00 when none are in the window) and "Total raised" sums trending creators; add `totals` to `exchange_json`. `GetCreatorHub` returns no events, so the Hub feed starts empty and fills from SSE. The demo button "Simulate $5,000 deposit" works again (fixed 2026-11-06: `runIncomeAudit` lifts a nested `proof` demo fixture); verified by curl, approved with a $250 DUE dividend, but the pending-dividend card was not re-checked in a browser. `data-hedera-pay` button markup is unrun against `hedera-pay.ts`.
- Live sponsor runs (none done yet): deploy contracts to Hedera testnet (`npm run deploy:hedera -w packages/contracts`) and set `CHAIN_RPC_URL`, `FACTORY_ADDRESS`, `USDC_ADDRESS`, `ORACLE_PRIVATE_KEY`; Hedera operator keys for the x402 rail; deploy the ATS factory and resolver for `ATS_ENABLED=1`; World ID staging app and RP key; 0G Galileo key and compute provider.
- Reclaim e2e (workstream 8): move the mock bank to a stable host, publish a provider version with that URL, run `proxy_callback_events` to `/reclaim/callback`, and test one real verification from the Hub.
- Docs: `docs/pitch.md` and `docs/product-spec.md` still mention Arkiv and Chainlink; align them with the three-sponsor scope.
- Backend: no `Last-Event-ID` replay on SSE; no e2e test for `AuditMilestone`; `DRAFT` creator status unused.

## Known issues

- UI (workstream 6): the `/events` feed shows time only (local), not date. Trade and Invest forms sit below the page content on phones (the Buy/Sell links jump to `#trade`). No dialog-based quick trade on the Exchange; Buy/Sell link to the creator page. Event-driven region reloads (`hx-get` + `hx-select`) replace the region's markup, so a half-typed field outside the Invest/Trade forms would be lost (the forms themselves are outside the regions). The dev DB now holds a `TESTR` creator from the launch test (`npm run dev -- --clear` then `seed:demo` resets). Dev server does not hot-reload TSX; restart it after component edits.
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
  - Reclaim: a newer Builder API (`@reclaimprotocol/client` 0.1.43) exists; SMX now uses it (workstream 7). Provider creation needs a public HTTPS `/mock-bank` JSON endpoint (tunnel in dev). Unverified whether `toJsonString()` includes the app secret: don't send it to the browser until checked.
  - Hashio (Hedera relay) is development-only and can throttle.
- Integrations (workstream 5):
  - Live sponsor paths (World ID, Reclaim, 0G, Hedera) are typechecked against package types but unrun; only chain and the demo paths are proven.
  - `terms_hash` is sha256, not keccak (changed `arkiv/schema.md` to match).
  - Hedera uses direct HTS transfers, not x402 (operator pays fees). 0G `ethers` is duplicated (storage SDK pins 6.13), so two casts bridge the types.
  - The routes the browser calls (`/api/world-id/rp-signature`, the Reclaim session route, `/api/audit-milestone`) are owned by workstream 4; none exists yet.
  - `npm install` of the new deps also updated `package-lock.json`.
- Hedera (workstream 9):
  - Live ATS mint and live x402 settlement are unrun (no operator key, no ATS deployment). The ATS ABI subset and role hash (`ROLE_ISSUER`, v8) come from `@hashgraph/asset-tokenization-contracts` 8.0.0; the README's reference testnet deployment is older, so deploy ATS yourself.
  - HashPack and other Hedera wallets now sign through WalletConnect (see Wallets). A generated or imported key remains an explicit option; the user funds its EVM address once.
  - `worker/dividends.ts` still imports the removed `streamDividend`; workstream 7 must switch it to `PaymentService`. `chain.ts` handles `freezeEscrow`/`unfreezeEscrow`, but nothing enqueues them yet (the sweep should insert those chain jobs).
  - HTS dividend mode needs the payer funded with the token and holders associated.
- Backend (workstream 4):
  - `POST /api/world-id/rp-signature` (used by `client/world-id.ts`) is NOT implemented: it isn't in the spec routes table. It needs an OpenAPI operation plus a thin route over the signing helper in `integrations/world-id.ts`. `GetLaunch` only returns `WORLD_APP_ID`, `WORLD_RP_ID`, `WORLD_ACTION`.
  - `npm run dev` always uses PGlite (it ignores `DB_URI`); `seed:demo` must run while the dev server is stopped. A dev-server `--seed` flag would be nicer but `scripts/dev.ts` isn't ours.
  - The sweep may move seeded `RAHUL` to `GRACE` within `SWEEP_INTERVAL_S` seconds; `TriggerDefault` works from `LIVE` or `GRACE`.
  - AMM liquidity is virtual (10% of the target, minimum 100 USDC, price 1.0); it is not backed by investor funds.
  - Chain jobs are never retried after `SENT`; a failure needs manual requeue.
  - pg_cron is not used: the sweep is one in-process timer protected by `SKIP LOCKED`.
