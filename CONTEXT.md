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

## Workstreams

| # | Workstream | Owner files | Status |
| --- | --- | --- | --- |
| 1 | Foundation: monorepo, app skeleton from Builder, client pkg, Docker, CI | root configs, `packages/app` infra, `packages/client` | Done |
| 2 | Contracts | `packages/contracts/**` | Done |
| 3 | Integration research + docs + Arkiv files | `docs/integrations/**`, `arkiv/**`, `README.md` | Done |
| 4 | Backend domain: OpenAPI, SQL, mutation routes, worker | `openapi.yaml`, `sql/**`, `src/routes/` (POST), `src/worker/**` | Todo |
| 5 | Integrations code | `packages/app/src/integrations/**`, `src/client/{wallet,world-id,reclaim}.ts` | Todo |
| 6 | UI: pages, components, CSS, client JS | GET routes, `src/components/**`, `public/styles/**` | Todo |

## Done

- Spec, pitch, engineering guide in `docs/`.
- Workstream 2: `packages/contracts` (Hardhat 3, viem, node:test) compiles and 3 tests pass. No deployed addresses yet. Commands: `npm run build` (compile + ABIs to `src/abis.gen.ts`), `npm test`, `npm run node`, `npm run deploy:{hedera,sepolia,0g}`. Docs in `docs/contracts.md`. Package has a temporary local `package-lock.json`.
- Workstream 3: seven integration guides in `docs/integrations/` (index in `docs/integrations/README.md`), `arkiv/schema.md`, `arkiv/friction.md`, root `README.md`, `docs/README.md`. Package versions verified on npm 2026-11-06: `@worldcoin/idkit-core` 4.6.0, `@reclaimprotocol/js-sdk` 5.8.3, `@x402/core` + `@x402/hedera` 2.30.0, `@0gfoundation/0g-compute-ts-sdk` 0.9.0, `@0gfoundation/0g-storage-ts-sdk` 1.2.13, `@chainlink/cre-sdk` 1.23.0, `@arkiv-network/sdk` 1.0.1.

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
- Routes: `ErrorPage`, `GetHome` (placeholder; workstream 6 replaces it with `GetExchange`).

`packages/client`: `Client.call(operationId, { params, query, body })` from `@stakeme/client/api`.

## Remaining

- Workstreams 4 to 6 in the table above.

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
