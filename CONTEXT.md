# CONTEXT

Hand-off file for StakeMe Exchange (SMX). A new agent reads this first, then
[`docs/product-spec.md`](docs/product-spec.md) and
[`docs/engineering-guide.md`](docs/engineering-guide.md). Update this file when
you finish a workstream: move items between sections and note decisions.

SMX is a liquid stock market for human potential. Creators IPO a share of
future income (a liquid income share agreement, L-ISA); investors buy creator
tokens; verified Web2 income releases escrow tranches and pays dividends. Built
solo for ETHGlobal Mumbai (November 5-7, 2026).

Reference clones (read-only, may be deleted; re-clone with `gh repo clone`):
`reclaimprotocol/builder` (architecture source) and
`reclaimprotocol/reclaim-design` (UI library).

## Decisions

- **Three sponsors: Hedera, World ID, 0G.** Chainlink CRE, Arkiv, Arc and
  Whitechain are deprecated: no code, env vars or adapter seams named after
  them. Their notes live in `docs/deprecated/`.
- **Reclaim is the proof source, not a prize target.** Reclaim zkTLS proves a
  bank deposit; the 0G agent audits that proof. Client: `@reclaimprotocol/client`
  (`sessions.create`, `results.receive`). Org
  `73351799-e315-4b65-bb8e-4df3496c7ec5`; `RECLAIM_ORG_SECRET` is in `.env`
  (gitignored, never print it).
- **Adapters stay generic**: `IStorageProvider` (0G Storage), `IOracle`
  (`ZeroGravityAgent`), `IPaymentRail` (Hedera). A new sponsor means a new class
  behind the factory. See "Adapter map".
- **0G is required for approval.** Every income proof is audited on 0G Private
  Computer through the 0G Router. If the call fails the proof stays `PENDING`
  ("0G audit unavailable, retry"). The rules engine runs only behind
  `ZG_ALLOW_RULES_FALLBACK=1` and is labelled in the UI.
- **Hedera ATS is live, with a simulated fallback.** With `ATS_MODE=live`,
  `integrations/hedera-ats.ts` mints the creator's equity token through the
  public ATS testnet Factory (for example `$MUSH`,
  `0xe3abC950d9daf866653931a314FF3F19E5276AFb`). A live error falls back to a
  simulated token, so an IPO never fails; the default mode is simulated.
  `CreatorShareToken` is the source of truth; the ATS token only mirrors it.
- **Trading and investing are user-signed onchain.** Each creator has a
  `CreatorPool` constant-product AMM (EIP-1167 clone, 0.3% fee kept in the
  pool), seeded at raise close with 10% of the target (minimum 100 USDC) of
  protocol-minted MockUSDC plus tokens at 1 USDC. Users sign `approve` and the
  swap or `LiquidISA.invest` in their own wallet; the server verifies the
  receipt and indexes the events into SQL (`ingest_onchain_swap`,
  `ingest_onchain_invest`). The chain is the truth; SQL is the index. Creators
  without a pool (old factory or simulated chain mode) use the SQL AMM.
- **Money rules.** Tranche 0 releases at raise close. A default refunds the
  current token holders (by holdings). After the term ends, the token is sell
  only and the stake returns to the creator. An unpaid dividend for a full
  cadence freezes the escrow like a missed proof. Supply = holdings + pool
  tokens, and the pool is excluded from dividends and refunds.
- **Dividends settle live on Hedera.** A creator-signed (or, with
  `HEDERA_OPERATOR_PAYOUT=1`, operator) HBAR multi-transfer pays holders at the
  testnet rate `DIVIDEND_HBAR_PER_USDC=0.0001`. There is no simulated fallback
  in production.
- **MockUSDC, not Circle USDC.** Circle testnet USDC (0.0.429274) exists, but
  its faucet is too small. MockUSDC has an in-app faucet (1,000 per click,
  50,000 cap).
- **Avatars come from IDs** (account and creator IDs, Gravatar), never from
  wallet addresses.
- **Solo builder.** Mushaheed Syed; X [@_predatorx7](https://x.com/_predatorx7),
  Telegram [@mushaheedx](https://t.me/mushaheedx). License: MIT.
- **Stack** follows Builder: Express 5, OpenAPI, PGTyped, Kita TSX, htmx,
  `@reclaimprotocol/design`; business rules in SQL. Browser web3 uses `viem`;
  World ID uses `@worldcoin/idkit-core` (the React-only `@worldcoin/idkit`
  doesn't fit a no-React app). Contracts: Hardhat 3 + viem. Scope `@stakeme`,
  schema `smx`, dev port 4020, Docker Postgres host port 5442.
- **Simulated chain mode** when `CHAIN_RPC_URL` is unset, so the demo runs with
  no keys.
- **World ID v4**: `POST /api/rp-signature` signs the request on the server;
  `POST /api/world-id/check` verifies with
  `https://developer.world.org/api/v4/verify/{rp_id}`. The nullifier is stored
  in Postgres and on the factory to block double IPOs and ban defaulters.
- **Safe stop**: a missed proof deadline makes the 0G agent freeze the Hedera
  escrow (`freezeEscrow`); a late approved proof unfreezes it; liquidation
  follows after the 14-day grace period.
- Tests only for core logic (SQL functions, contract math, adapters). No broad
  UI or e2e suites. Docs follow the Google developer documentation style; draw
  diagrams as mermaid.

## Live status (2026-11-07)

Secrets live only in `.env` (gitignored). The IDs below are public.

| Area | Status |
| --- | --- |
| Public site | https://stakeme.magnificlabs.org (Cloudflare DNS only). The URL is also recorded in `/Users/syed/Projects/external/stakeme-presentation/DEPLOYED_URL`. |
| Hosting | GCP project `stakeme-ex-261106`, VM `smx-prod` (asia-south1-a, e2-medium, 20 GB), Docker Compose: Caddy with Let's Encrypt TLS, the app, Postgres 18. Files `deploy/gcp.sh`, `deploy/docker-compose.prod.yml`, `deploy/Caddyfile`; guide `docs/deployment.md`. The `deploy/` folder, `Dockerfile` and `docs/deployment.md` are committed (cf42922). `/`, `/creators` and `/creators/MUSH` return 200 (MUSH shows "Audited by 0G Private Computer"); `/creators/MUSH/audit-report` returns 402 unpaid. |
| Cost guard | Budget `smx-cap` 2000 INR (alerts at 50/90/100%; alerts only, no cap on spend). Schedule `smx-stop-nov9` stops the VM Monday 2026-11-09 01:00 IST. `deploy/gcp.sh destroy` removes everything after judging. |
| Hedera testnet (chain 296) | Deployer, oracle and operator account `0x96B380895ea976cbEc267b959A1D116C457705aF` (testnet-only key, also used for 0G). Deployed 2026-11-06 20:30 UTC (about 5.65 HBAR): `MockUSDC` `0x40027d9375311fa44b95ef881a92374b1dbf8ec4`, `LiquidISA` implementation `0x3f61050ad9fb221992742f10b34237b06a97e361`, `CreatorShareToken` implementation `0x81521abe9ddc7dc792b4c6f4262a48bc744426ff`, `CreatorPool` implementation `0xe310d76b357be72439e78fff84a82fe486fba84b`, `LiquidISAFactory` `0xc6b7af9392538bc596caed4a5758b9d92f650e59`. Source of truth: `packages/contracts/deployments/hedera-testnet.json`. All five are verified on Sourcify (exact match), which HashScan reads; links in `docs/contracts.md`. The earlier factory `0xbbc4d973...` is superseded. Clones show no source of their own and delegate to the verified implementations. An IPO costs about 0.76 HBAR. |
| World ID | Staging app `app_0b5a20d804cb26e5008896d976fc4193`, RP `rp_6a0a12bcfbc0fbf0`, action `smx-launch-ipo`, `WORLD_ENV=staging`. Verified end to end with the World ID Simulator. The debrief and trust moment are in `docs/world-id-debrief.md`. |
| 0G Private Computer | Live through the 0G Router (`ZG_ROUTER_API_KEY`, model per `ZG_ROUTER_MODEL`, trust mode `private`). Router credits: $11; the Hub shows the balance. Example request ID: `3a1c2f3b-6177-4ab8-aa52-c1b5ff80dc8c`. The proof row shows model, request ID and provider; "TEE verified" shows only when the Router returns `tee_verified: true`. |
| 0G Storage | Live on Galileo with the same account (about 0.0012 0G per upload, faucet refills about 0.5 0G every 25 h). A worker uploads terms and audit logs in the background. |
| Reclaim | Provider `3fefebae-05cb-4d6b-b319-f3f639a31201` ("SMX Mock Bank Deposit", private) at v0.1.2, pointing at the production mock bank (`https://stakeme.magnificlabs.org/mock-bank`). Proof verified through the Reclaim MCP `run_proof` (`amount`, `deposit_date`). A full in-app session is not yet confirmed. |
| Hedera ATS | Live mint on testnet through the public ATS Factory (`0xd1F118A40f3b02883D35909eF2517e7EDd78379d`). `$MUSH`: [`0xe3abC950d9daf866653931a314FF3F19E5276AFb`](https://hashscan.io/testnet/contract/0xe3abC950d9daf866653931a314FF3F19E5276AFb) (0.0.11345067), about 0.23 HBAR. Details in `docs/integrations/hedera.md`. |
| Dividend settlement | Live on Hedera: [0.0.11340822@1793996054.174485762](https://hashscan.io/testnet/transaction/0.0.11340822@1793996054.174485762), one multi-transfer to holders at 0.0001 HBAR per USDC. |
| x402 payments | The audit report (`GET /creators/{ticker}/audit-report`, 0.1 HBAR) is paywalled and bought by `packages/app/scripts/x402-research-agent.ts` with spend controls. Settled testnet transactions (run against a local second instance on 2026-11-07, because the public site did not serve the route then): [CHEF](https://hashscan.io/testnet/transaction/0.0.9185802@1793992761.545261642), [LOFI](https://hashscan.io/testnet/transaction/0.0.9185802@1793992766.013363358), [MUSH](https://hashscan.io/testnet/transaction/0.0.9185802@1793992768.127890663); earlier single-payer run [0.0.9185802@1793985016.835902874](https://hashscan.io/testnet/transaction/0.0.9185802@1793985016.835902874). Details and the over-cap refusal: `docs/x402-agent.md`. |
| WalletConnect | Project created, public project ID in `.env`; the deployment domains are allowlisted (done by hand). QR pairing is verified in Chrome. |
| Seed | `npm run seed:demo` seeds 8 creators (MUSH, RAVI, RAHUL, PRIYA, KART, ANANYA, ROHAN, TIFFIN) and closes each raise. |
| Production redeploy | In progress. Only MUSH, RAVI and RAHUL are onchain on the new factory; the other 5 creators are DB-only. |

## What's real vs simulated

| Area | State |
| --- | --- |
| Contracts on Hedera | Real: factory, clones (ISA, token, pool), escrow, tranches, freeze, liquidation, verified on Sourcify. |
| Trading | Real, onchain: `CreatorPool` AMM per creator, user-signed `approve` and swap, server-verified receipts indexed into SQL. Creators without a pool (old factory or simulated chain mode) use the SQL AMM. |
| Invest and stake | Real, onchain: user-signed `approve` and `LiquidISA.invest`, server-verified. The creator stake is locked by `initializeIPO`. |
| Pool liquidity | Protocol-provided: MockUSDC and tokens minted into the pool at raise close (10% of target, minimum 100 USDC). Not investor funds. |
| USDC | Mock: `MockUSDC` with a faucet (1,000 per click, 50,000 cap). Not Circle USDC. |
| ATS equity token | Real with `ATS_MODE=live` (public ATS testnet Factory, `$MUSH` above). A live error falls back to a simulated token (`sim:0x...`); the default mode is simulated. |
| Dividend settlement | Real: creator-signed or operator HBAR multi-transfer on Hedera at the testnet rate. No simulated fallback in production. |
| Mock bank | Mock data source with six scenarios (salary $5,000, low $800, big $25,000, several deposits, none, late); the zkTLS proof is real. The auditor pre-checks the deposit date window and denies out-of-period deposits without a 0G call (engine `pre-check`). |
| World ID | Staging app and Simulator, not production Orb credentials. Production is possible (`docs/world-id-debrief.md`). |
| 0G | Router audit and Storage are live. 0G Compute through the SDK broker is off (`ZG_COMPUTE_ENABLED`; needs a 3 0G ledger deposit). |
| Demo routes | Locked down: `trigger-default` needs `DEMO_MODE=1` and the admin key; demo proofs need the signed-in creator owner and allow 3 per creator per hour. |
| Other | Chain calls and proofs have a demo fallback (`DEMO_MODE=1` fixture proofs, simulated chain mode). |

## Remaining

Deadline: submission by Saturday 2026-11-07 09:00 IST. Today is that day.

1. **Finish the production redeploy** with `deploy/gcp.sh` (in progress). Only
   MUSH, RAVI and RAHUL are onchain on the new factory; the other 5 seeded
   creators are DB-only. Seed one at a time per oracle key to avoid nonce
   collisions. After it lands, check `/creators/MUSH` shows the pool and the
   ATS token.
2. **Screenshots** of the Exchange, instrument view, Portfolio, Hub and audit
   proof for the submission.
3. **Rerun the x402 research agent against the public site** and record the
   transactions in `docs/x402-agent.md`. Also fix its caveat: the recorded run
   predates the Router parser fix, so the pick and memo steps were not
   exercised.
4. **Reclaim in-app end to end**: create a session from the Hub on the public
   site, sign in on the hosted client, confirm `PROOF_VERIFIED` and the 0G
   audit.
5. **Demo video** (2:30 to 3:00, plan in `docs/demo-video.md`).
6. **Submit** by 09:00 IST: repo link (confirm public), video, live URL,
   contract addresses, team contacts, AI disclosure (`docs/ai-usage.md`), and the
   three partner prizes. Track status is in `docs/prize-checklist.md`.
7. Optional: a phone-wallet signature test; the `no e2e test for
   AuditMilestone` gap; unused `DRAFT` creator status; a production World ID
   app.

## Known issues

- Public site: `GET /creators` returned 404 in a 30-minute window on 2026-11-07
  (00:18 to 00:48 IST); it now returns 200, and the audit-report route returns
  402 unpaid.
- Production onchain `createISA` jobs are being fixed with a per-environment
  World ID nullifier salt.
- Image build on the VM is slow (about 10 minutes first time; hardhat compile
  downloads solc) and needs the e2-medium memory. The `up` command builds
  inside a `systemd` unit so SSH drops don't kill it.
- Hedera mirror-node lag: right after a deploy Hashio reads fail with
  `FAIL_INVALID`, receipts can lag by minutes, and a quick second transaction
  can hit "nonce too low". `chain.ts` retries and waits; Hedera bills at least
  80% of the gas limit, so calls set `estimateGas` + 20%. Hashio is
  development-only and can throttle. Chain jobs are not retried after `SENT`;
  a failure needs a manual requeue.
- There is no nullifier reset. To reseed a demo, deploy a fresh factory
  (about 5.7 HBAR with the pool implementation) and update `FACTORY_ADDRESS`.
- Contracts: dividend payouts can be 1 base unit short (floor rounding); solc
  needs `viaIR`.
- Not verified live: a full WalletConnect signature from a phone wallet,
  HashPack accepting a transaction whose fee payer is the SMX operator, and
  the Hedera signer dialog with a WalletConnect wallet. Wallet details are in
  "Wallets".
- Live ATS mints fall back to a simulated token on any error, so check the
  creator's `atsTokenAddress` before you claim a live token. The public ATS
  testnet contracts are shared and expire unless their owner renews them.
- Old creators (launched on the previous factory) have no pool and still trade
  on the SQL AMM.
- The pool's MockUSDC liquidity is minted by the protocol, so pool prices do
  not reflect investor-funded liquidity.
- `UniversalConnector.connect()` never settles when the modal closes;
  `walletconnect-evm.ts` watches the modal through a private field. The EVM and
  Hedera WalletConnect SDKs use different storage prefixes on purpose.
- `docs/demo-video.md` names Arkiv and Chainlink only to say they are out of
  scope.
- UI: the `/events` feed shows time only, not date; Trade and Invest forms sit
  below the content on phones; the dev server doesn't hot-reload TSX.
- Dev and tests use PGlite, where `pg_cron` is off; the deadline sweep is one
  in-process timer protected by `SKIP LOCKED`. `npm run dev` always uses PGlite
  and ignores `DB_URI`; run `seed:demo` while the dev server is stopped. The
  sweep can move seeded `RAHUL` to `GRACE` within `SWEEP_INTERVAL_S`.
- Pins: `@adiwajshing/eslint-config` must stay on commit `607fc28f`;
  `@reclaimprotocol/design` is pinned to `60641e29`. Vite warns about htmx's
  `eval` (harmless).
- SIWE users get a placeholder email because Better Auth requires one.
- An unauthenticated Reclaim failure event can end a pending session (low risk:
  session IDs are random).

## How to run

```bash
nvm use                   # Node 24
npm install
cp .development.env .env  # edit as needed; never commit it
npm run seed:demo         # optional; run while the dev server is stopped
npm run dev               # PGlite dev server at http://localhost:4020
```

- Real Postgres (pg_cron, PGTyped): `npm run db:up` (host port 5442), then
  `npm run gen`. Stop with `npm run db:down`. Full stack: `docker compose up --build`.
- Reset the dev database: `npm run dev -- --clear`.
- Schema change: edit `packages/app/sql/ddl.sql`, run `npm run migrate:plan`,
  then `npm run pgtyped:typegen`. New route: see `packages/app/AGENTS.md`;
  `npm run openapi:gen --workspace=packages/app` regenerates the client types.
- Contracts: `npm run build|test` in `packages/contracts`;
  `npm run deploy:hedera -w packages/contracts` deploys a fresh set and writes
  `deployments/hedera-testnet.json`.
- Before reporting done: `npm run gen:check && npm run check && npm run lint:fix && npm test`.
- x402 agent: see `docs/x402-agent.md`.

### Deploy to production

```bash
deploy/gcp.sh budget && deploy/gcp.sh provision   # first time only
deploy/gcp.sh push    # git archive HEAD + deploy files + .env (scp) + generated .env.prod
deploy/gcp.sh up      # build, migrate, start, wait for /healthz
deploy/gcp.sh status | logs [svc] | ssh [cmd] | stop | start | destroy
```

`SMX_DOMAIN` defaults to `stakeme.magnificlabs.org`; `push` sets
`CANONICAL_ORIGIN` from it. `.env` goes by `scp` only; the Postgres password
lives on the VM in `/opt/smx/.pgpass-smx`. The seed command for production is in
`docs/deployment.md` (it sends real Hedera transactions).

## Reference

Stable notes on the codebase. Keep the section names; other docs link to them.

## Skeleton map

All paths are under `packages/app/` unless noted.

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
| 0G Router | `ZG_ROUTER_API_KEY` (secret), `ZG_ROUTER_MODEL` (default `0GM-1.0-35B-A3B,glm-5.3`, a preference list), `ZG_ROUTER_TRUST_MODE` (`verified`\|`private`, default omitted), `ZG_ROUTER_BASE_URL` | Audit verdict runs on the Router first (`engine: '0g-router'`, log has `routerTrace`); any error (402, timeout) leaves the proof `PENDING` (`AUDIT_UNAVAILABLE`) unless Compute is enabled or `ZG_ALLOW_RULES_FALLBACK=1`. Live with the funded Router key. |
| Storage | `STORAGE_PROVIDER=0g\|local` (default `0g`), `ZG_*`, `ZG_STORAGE_MIN_BALANCE` | Uploads run in the worker (see "0G Storage outbox"). Without `ZG_PRIVATE_KEY`, with `local`, or below the floor: SKIPPED, ref stays `local:<sha256>`. |
| Chain | `CHAIN_RPC_URL`, `CHAIN_ID`, `ORACLE_PRIVATE_KEY`, `FACTORY_ADDRESS` | `CHAIN_RPC_URL` unset: SIMULATED, tx hash = keccak256(job id), fake ISA/token addresses. |
| Hedera | `HEDERA_OPERATOR_ID`/`HEDERA_ACCOUNT_ID`, `HEDERA_OPERATOR_KEY`/`HEDERA_PRIVATE_KEY`, `HEDERA_DIVIDEND_TOKEN_ID`, `HEDERA_NETWORK`, `DIVIDEND_HBAR_PER_USDC`, `HEDERA_ALLOW_SIMULATED`, `HEDERA_OPERATOR_PAYOUT` | SIMULATED `sim:0x...` receipts outside production. In production, payment requests fail with 503 unless `HEDERA_ALLOW_SIMULATED=1`. |
| Hedera ATS | `ATS_MODE` (`live`\|`simulated`), `ATS_FACTORY_ADDRESS`, `ATS_RESOLVER_ADDRESS`, `ATS_CONFIG_VERSION` | Simulated token (`SIMULATED`) by default and on any live error. Live signs with the operator key. |

Extra exports routes should use (all re-exported from `integrations/index.ts`, additive):
- `createWorldIdRequest(signal)`: expose as `POST /api/rp-signature` (default URL the browser calls; read `signal` from the SIWE session wallet, never the body). Returns `{ rpContext, appId, action, environment, signal, demo }`.
- `demoIncomeProof(context, amount)`, `demoWorldIdProof(kind, nonce)`: fixtures (the browser builds identical ones).
- `isWorldIdConfigured()` lives in `world-id.ts` (not re-exported): render `data-app-id` only when true.

`ChainJob.args` shapes `chain.ts` reads (amounts are USDC decimal strings, parsed with 6 dp):
- `createISA`: `{ name, ticker, totalRaise, creatorStake, shareBps, termMonths, trancheBps?, worldIdNullifier | worldIdNullifierHash }`; `contractAddress` = factory (or `FACTORY_ADDRESS`).
- `invest` / `distributeDividend`: `{ amount }` (the `invest` job is queued only on the SQL path); `initializeIPO`, `closeRaise`, `unlockNextTranche`, `freezeEscrow`, `unfreezeEscrow`, `reclaimStake`, `executeLiquidation`: no args or `{ amount }`. `contractAddress` = the ISA.
- Users sign their own `approve`, `invest` and pool swaps; the oracle key signs the creator-side and oracle calls (`createISA`, `initializeIPO`, tranche releases, freeze, liquidation).

Rules: `verifyIncomeProof` does not dedupe; store `proofId` under a unique index and reject repeats. `createReclaimSession` takes an absolute `callbackUrl`. Browser demo posts for Reclaim use body key `proof` (configurable).

## Backend map

Full guide: [`docs/backend.md`](docs/backend.md). Paths under `packages/app/`.

- Tables: `creators`, `tranches`, `investments`, `holdings`, `pools`, `trades`, `price_ticks`, `income_proofs`, `dividends`, `payouts`, `oracle_events`, `chain_jobs`, `blacklisted_nullifiers`, `creator_updates`, `watchlists`, `storage_uploads`, `reclaim_sessions`. The base migration is `migrations/20261106111202382.domain.sql` (two manual `SET` header lines; see its comment); later migrations add the instrument view, portfolio, creator profile, `onchain_ingest` and `raise_close`. To re-plan the base after a `ddl.sql` change, delete the domain migration, run `npm run migrate:plan`, rename, and keep the header.
- SQL functions (`sql/ddl.sql`): `launch_ipo`, `record_investment`, `finish_raise`, `close_raise`, `amm_swap`, `ingest_onchain_swap`, `ingest_onchain_invest`, `post_creator_update`, `submit_income_proof`, `audit_income_proof`, `pay_dividend`, `sweep_deadlines`, `liquidate_creator`, `complete_chain_job`, `emit_oracle_event`, `demo_trigger_default`, `demo_spread_history`; JSON builders `creator_json`, `creator_summary_json`, `exchange_json`, `creator_page_json`, `creator_hub_json`, etc. Queries in `sql/queries.sql`.
- Routes (`src/routes/`): GetExchange (`/`), GetCreator (instrument view), GetCreatorHub, GetLaunch, GetPortfolio, RequestTestUsdc, GetCreatorChain, CloseRaise, CreateCreatorUpdate, watchlist routes, GetMockBank, LaunchIpo, Invest, Trade, CreateReclaimSession, ReclaimCallback, AuditMilestone, TriggerDefault, PayDividend, StreamEvents. All GET pages already load data and return JSON on negotiation; mutations use `utils/mutation.ts` `respondMutation` (htmx 204 + `HX-Trigger`/`HX-Redirect`, JSON 201). Types: `src/types/domain.ts` (schema aliases).
- Worker (`src/worker/`): chain jobs (pgmb wake-up, boot drain, 15 s poll), dividend streaming on `DIVIDEND_PAID`, deadline sweep timer (`SWEEP_INTERVAL_S`).
- SSE `GET /events` (replays up to 50 missed oracle events from `Last-Event-ID` or `?since=`; oracle messages carry `id:` = `oracle_events.seq`, `chain-job` has none; migration `20261106170000000.oracle_event_seq.sql`): `oracle-event` (HTML from `components/events/OracleEventItem.tsx`), `oracle-event-json`, `chain-job` (JSON `{id, creatorId, fn, status, txHash}`). `?ticker=` filters.
- Page components (`src/components/pages/`, props are OpenAPI types from `src/types/domain.ts`): `ExchangePage({ exchange: Exchange })`, `CreatorPage({ page: CreatorPage })`, `CreatorHubPage({ hub: CreatorHub })`, `LaunchPage({ state: LaunchState })`, `MockBankPage({ bank: MockBank })`, `PortfolioPage` (wallet funds, holdings, P&L, transactions, dividends received), plus `OracleEventItem({ event: OracleEvent })`. Mutation endpoints the UI calls: see `docs/backend.md` routes table. `Creator.chain.pendingJobs > 0` means show the pending badge until a `chain-job` SSE event.
- Seed: `npm run seed:demo` (PGlite by default, `-- --pg` for Docker Postgres). Seed before `npm run dev`; PGlite is single-process. Tests: `tests/domain.test.ts` (4 describes).

## Adapter map

Docs: [`docs/architecture-adapters.md`](docs/architecture-adapters.md) (class diagram). Code under `packages/app/src/services/`; routes and workers import only from `services/index.ts`.

| Interface | Default | Factory / switch |
| --- | --- | --- |
| `IStorageProvider` (`putJson({kind, key, data, attributes}) -> {ref, contentHash}`) | `ZeroGravityStorage` inside `FallbackStorage`, then `LocalStorageProvider` | `createStorageProvider()`; env `STORAGE_PROVIDER=0g\|local`; no `ZG_PRIVATE_KEY` gives local. |
| `IOracle` (`createProofRequest`, `fetchVerifiedIncome`, `getProofRequestStatus`) | `ZeroGravityAgent` (also `audit()` on 0G Compute, log written through the storage provider) | `createOracle()`; `OracleDecorator` wraps another oracle. |
| `IPaymentRail` (`payout`, optional `createPaymentRequest`, `settle`) | `HederaPaymentRail`  | `createPaymentService(pg)` / `createPaymentRail()`. `PaymentService` takes splits from SQL, checks they sum, records receipts. |

- New implementation: add a class, return it from the factory. No other file changes.
- Refs in Postgres: `creators.terms_ref` (L-ISA terms, 0G root hash or `local:`), `income_proofs.audit_log_ref` (every APPROVED/DENIED audit log). Both start as `local:<sha256>`; see "0G Storage outbox".
- Safe stop: `sweep_deadlines` LIVE->GRACE calls `freeze_escrow` (event `ESCROW_FROZEN`, chain job `freezeEscrow`); a late approved proof in GRACE emits `ESCROW_UNFROZEN` and queues `unfreezeEscrow`. `creators.ats_token_address` (JSON `atsTokenAddress`) is stored by `complete_chain_job`.
- World ID: `POST /api/rp-signature` (`CreateRpSignature`, signal = SIWE wallet). `createISA` job args now include `worldIdNullifier` and `termsRef`.
- API surface added: `GetMockBankLogin`, `MockBankLogin`, `GetMockBankTransactions`, `GetReclaimSessionStatus`, `CreateRpSignature`, `CreateDividendPaymentRequest`; `PayDividend` takes optional `{ paymentPayload }`.
- JSON change: creator `arkivEntityKey` is now `termsRef` (CreatorPage updated).
- One migration: `migrations/20261106114000000.adapters.sql` (hand-edited: rename `arkiv_entity_key` -> `terms_ref`). New table `reclaim_sessions`, column `income_proofs.reclaim_session_id`.

### Reclaim client flow

`@reclaimprotocol/client` 0.1.43 (js-sdk removed). Env: `RECLAIM_ORG_SECRET`, `RECLAIM_PROVIDER_ID`, `RECLAIM_ORG_ETH_PRIVATE_KEY` (optional: org result encryption is OFF, results are plaintext; passed only when set). `CreateReclaimSession` -> `sessions.create` (context `{creatorId, ticker}`), row in `reclaim_sessions`. Callback: `POST /reclaim/callback` on port 4020; it looks up the session by the envelope `sessionId` and calls `results.receive` with `reclaimSessionId` and `expectedAud` from the DB. `ResultVerificationError`: `retryable` -> 503, else 200. Failure events set session status and `failure_reason`. Polling fallback `GET /reclaim/sessions/{sessionId}`. The provider must expose the deposit as extracted parameter `amount`, `deposit_amount`, `depositAmount` or `income`.


## 0G Storage outbox (2026-11-06)

Each 0G upload takes ~30 s and ~0.0012 0G, so requests never wait for it. Details: `docs/backend.md` (Worker), `docs/integrations/zero-g.md`.

- `LaunchIpo` (`prepareTerms`) and the audit pipeline (`ZeroGravityAgent.audit()` returns `logRef = local:<sha256>` plus `logDocument`) compute the canonical document and hash synchronously. `launch_ipo(..., p_terms_document)` / `audit_income_proof(..., p_log_document)` commit with the local ref and call `enqueue_storage_upload` into table `storage_uploads` (QUEUED | UPLOADED | FAILED | SKIPPED; `attempts`, `next_attempt_at`).
- `worker/storage-uploads.ts` (woken by `smx.storage_uploads.insert` + 15 s poll; `createUploadProvider()` = raw `ZeroGravityStorage`, no local fallback) runs `claim_storage_upload` then `complete_storage_upload`: UPLOADED swaps the root hash into `terms_ref` / `audit_log_ref` and emits oracle event `STORAGE_CONFIRMED` (`kind`, `ref`, `contentHash`, `url`; no price tick). SKIPPED (no key, `STORAGE_PROVIDER=local`, balance under `ZG_STORAGE_MIN_BALANCE`) keeps the local ref. Transient failures back off 30 s / 2 min, 3 attempts, then FAILED. A content hash already UPLOADED is never uploaded twice.
- JSON/OpenAPI: creator `termsStorage`, income proof `auditLogStorage` (`PENDING | UPLOADED | SKIPPED | FAILED`). UI: `StorageRef` in `components/TxLink.tsx` shows "0G Storage: pending", then the root hash linked to storagescan after the event reloads the region. The `createISA` chain job still carries the local `termsRef`; chain jobs never wait on storage.
- Chain: `RequeueFailedChainJobs` also requeues `FAIL_INVALID` errors (Hedera mirror lag after a deploy); migration `20261106162000000.storage_outbox.sql` requeues existing ones. Worker boot drains (chain and storage) are no longer awaited, so the HTTP server starts at once (a boot drain of seeded real chain jobs used to hold it for minutes).
- Live check (2026-11-06): `POST /creators` returned 201 in 88 ms with `PENDING`; the ref flipped to the root hash on the 3rd attempt (two transient `socket hang up` / RPC timeouts, backoff worked). Storagescan URL form `/tool/file?root=` is unverified in a browser.
- Tests: `tests/storage-outbox.test.ts` (ref swap + event, dedupe, SKIPPED via injected `skipReason`, retry then FAILED).

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
