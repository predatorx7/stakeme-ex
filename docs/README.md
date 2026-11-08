# Documentation

Start with [`../CONTEXT.md`](../CONTEXT.md) for current status, decisions, and
what's left. SMX targets three sponsors: Hedera, World ID, and 0G.
Reclaim supplies the zkTLS bank proof that the 0G agent audits. The app is
Express and htmx, not Next.js.

## Product

| Document | What it covers |
| --- | --- |
| [product-spec.md](product-spec.md) | What SMX does: domain model, state machines, SQL business logic, routes, proof and liquidation flows. |
| [user-flows.md](user-flows.md) | Diagrams of the creator and investor journeys, income proof, creator states, default path, and dividend payment. |
| [ai-usage.md](ai-usage.md) | Statement of where and how AI tools were used. |
| [demo-video.md](demo-video.md) | Script and plan for the demo video. |

## Engineering

| Document | What it covers |
| --- | --- |
| [engineering-guide.md](engineering-guide.md) | Architecture, code style, and tooling, modeled on Reclaim Builder. Wins over the spec on code style. |
| [backend.md](backend.md) | Data model, SQL functions, routes, worker, and demo seed. |
| [contracts.md](contracts.md) | `LiquidISA`, factory, share token, dividend math, freeze, liquidation, and deploys. |
| [frontend-hooks.md](frontend-hooks.md) | Data-attribute contract for the wallet, World ID, Reclaim, and Hedera payment browser modules. |
| [architecture-adapters.md](architecture-adapters.md) | The `IStorageProvider`, `IOracle`, and `IPaymentRail` adapters and their fallbacks. |
| [deployment.md](deployment.md) | Deploy SMX to a Compute Engine VM with Docker Compose. |
| [diwali-theme.md](diwali-theme.md) | The festive theme layer over the Reclaim design system. |

## Integrations

| Guide | What SMX uses it for |
| --- | --- |
| [integrations/hedera.md](integrations/hedera.md) | Hedera EVM escrow, ATS-ready equity token (simulated), x402 dividend payouts, safe-stop freeze. |
| [integrations/world-id.md](integrations/world-id.md) | World ID v4 proof of human, server-side RP signature, nullifier handling. |
| [integrations/zero-g.md](integrations/zero-g.md) | 0G Compute auditor agent and 0G Storage logs for terms and audit decisions. |
| [integrations/reclaim.md](integrations/reclaim.md) | Reclaim zkTLS bank proof, mock bank, and provider setup. |
| [integrations/README.md](integrations/README.md) | Summary of every integration, env vars, and demo fallbacks. |
## Writing style

Docs follow the Google developer documentation style guide: second person,
present tense, active voice, sentence-case headings, short paragraphs. Draw
diagrams as Mermaid blocks.
