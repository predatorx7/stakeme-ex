# Code reuse disclosure

**Summary:** SMX's app skeleton (infrastructure, UI components, build scripts) was adapted from Reclaim Builder, a private Reclaim Protocol project that the developer contributes to. All StakeMe domain logic, contracts, integrations, and pages were written during the hackathon. The UI library and other dependencies are published packages.

This file lists what is reused, adapted, and new. The comparison was a file-by-file heuristic (path and content diff against the Builder source), not a line-level audit.

## Reused

| Item | Source | License | Notes |
| --- | --- | --- | --- |
| App skeleton files copied from Reclaim Builder, unchanged (listed below) | [reclaimprotocol/builder](https://github.com/reclaimprotocol/builder) | Private repository, no public license. The developer contributes to it. | Infrastructure and generic UI. |
| `@reclaimprotocol/design` (UI components and styles), pinned to commit `60641e2` | [reclaimprotocol/reclaim-design](https://github.com/reclaimprotocol/reclaim-design) | MIT | Installed from GitHub as a dependency, not copied. |
| Other npm dependencies (OpenZeppelin contracts, viem, Express, htmx, and so on) | npm | Each package's own license, see `package-lock.json` | Not modified. |

Files copied from Builder byte-for-byte (under `packages/app/` unless noted):

- Build and config: `tsconfig.json`, `tsconfig.test.json`, `vite.client.config.ts`, root `tsconfig.json`, root `postgres-language-server.jsonc`.
- Scripts: `scripts/gen-stamp.ts`, `scripts/migrate.ts`, `scripts/openapi-typegen.ts`, `scripts/start.ts`, `scripts/warm-test-snapshot.ts`.
- Tests: `tests/pglite.ts` (PGlite test harness).
- Server: `src/logger.ts`.
- Utilities: `src/utils/dates.ts`, `plural.ts`, `escape.ts`, `client-assets.ts`.
- Components: `Badge`, `BlockingWarning`, `Breadcrumbs`, `CodeBlock`, `CopyButton`, `CopyField`, `EmptyState`, `ExpandableCard`, `Hint`, `Icon`, `IndexHtml`, `Kpi`, `NumberedStep`, `Notice`, `Progress`, `SectionCard`, `Tag`, `ActionMenu`, `nav-swap.ts`.
- Dialog: `components/dialog/*` (Dialog, DialogCloseButton).
- Forms: `components/forms/*` (HxForm, Field, FormError, SearchInput).
- Charts: `AreaChart`, `BarChart`, `BarList`, `ChartPlot`, `Legend`, `labels.ts`.
- Other: `src/routes/ErrorPage.tsx`, `public/styles/fonts.css`.

## Adapted

Copied from Builder, then changed for SMX (rebranded, trimmed, or extended):

- Server core: `src/app.ts` (route wiring, SSE), `src/server.ts`, `src/index.ts`, `src/db.ts`, `src/pgmb.ts`, `src/auth.ts`, `src/better-auth.ts`, `src/better-auth.cli.ts`, `src/otel.ts`, `src/consts.ts`, `src/queries.ts`, `src/worker/register.ts`.
- Utilities and types: `src/utils/http.ts`, `money.ts`, `tones.ts`; `src/types/*`.
- Components: `Layout`, `Header`, `PageHeader`, `PublicShell`, `Avatar`, `DataTable`, `charts/ChartFrame.tsx`, `charts/segments.ts`.
- Scripts and tests: `scripts/dev.ts`, `scripts/check-gen.ts`, `scripts/pgtyped.sh`, `tests/utils.ts`, `pg-migrate.config.ts`, `package.json`.
- Infrastructure: root `Dockerfile` and `docker-compose.yml` (same structure, SMX services), `eslint.config.js`, `pgtyped.config.json`.
- Styles: `public/styles/{index,app,public}.css`, `src/client/{index.ts,behaviors.ts,index.css}`, which keep Builder's structure on top of the Reclaim design package.

## New during the hackathon

- Product domain: `openapi.yaml` operations for creators, trades, proofs and dividends; `sql/ddl.sql` domain tables and functions; `sql/queries.sql`; `migrations/`.
- Smart contracts: `packages/contracts/` (all).
- Integrations: `src/integrations/*` (chain, Hedera ATS, Reclaim, World ID, 0G adapters).
- Services: `src/services/*` (oracle, payment, storage, mock bank).
- Worker: `src/worker/chain-jobs.ts`, `dividends.ts`, `storage-uploads.ts`, `sweep.ts`.
- Routes and pages: all `src/routes/*` operations except `ErrorPage.tsx`, and `src/components/pages/*`, `lists/*`, `events/*`, plus the SMX-specific components (`PriceChart`, `Sparkline`, `ProofAudit`, `CreatorStatus`, `ChainJobBadge`, `Countdown`, `PriceChange`, `TxLink`, `WalletDialogs`, `ZeroGBalance`).
- Domain utilities: `dividend-payment`, `income-audit`, `negotiation`, `proof-body`, `storage-ref`, `map-error`, `mutation`, `pagination`, `json`, `gravatar`.
- Browser modules: `src/client/{wallet,walletconnect*,hedera-pay,world-id,reclaim,live,key-export,launch-form,web3-util,diwali-effects}.ts`.
- Theme CSS, `deploy/` (Caddyfile, prod compose, GCP script), and everything under `docs/`.
