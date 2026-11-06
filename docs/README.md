# Documentation

Start with [`../CONTEXT.md`](../CONTEXT.md) for current status, decisions, and
what's left. SMX targets three sponsors: Hedera, World ID, and 0G. Reclaim
supplies the bank proof that the 0G agent audits.

## Product

| Document | What it covers |
| --- | --- |
| [product-spec.md](product-spec.md) | What SMX does: domain model, state machines, SQL business logic, routes, proof and liquidation flows. |
| [pitch.md](pitch.md) | Pitch, user journeys, three-minute stage script, demo setup, booth questions. |

## Engineering

| Document | What it covers |
| --- | --- |
| [engineering-guide.md](engineering-guide.md) | Architecture, code style, and tooling, modeled on Reclaim Builder. Wins over the spec on code style. |
| [backend.md](backend.md) | Data model, SQL functions, routes, worker, and demo seed. |
| [contracts.md](contracts.md) | `LiquidISA`, factory, share token, dividend math, freeze, liquidation, and deploys. |
| [frontend-hooks.md](frontend-hooks.md) | Data-attribute contract for the wallet, World ID, Reclaim, and Hedera payment browser modules. |

## Integrations

| Guide | What SMX uses it for |
| --- | --- |
| [integrations/hedera.md](integrations/hedera.md) | Hedera EVM escrow, ATS equity token, x402 dividend payouts, safe-stop freeze. |
| [integrations/world-id.md](integrations/world-id.md) | World ID v4 proof of human, server-side RP signature, nullifier handling. |
| [integrations/zero-g.md](integrations/zero-g.md) | 0G Compute auditor agent and 0G Storage logs for terms and audit decisions. |
| [integrations/reclaim.md](integrations/reclaim.md) | Reclaim zkTLS bank proof, mock bank, and provider setup. |
| [integrations/README.md](integrations/README.md) | Summary of every integration, env vars, and demo fallbacks. |

## Deprecated

[deprecated/](deprecated/README.md) keeps the removed Chainlink CRE, Arkiv, and
Arc guides for reference. Nothing in the app uses them.

## Writing style

Docs follow the Google developer documentation style guide: second person,
present tense, active voice, sentence-case headings, short paragraphs. Draw
diagrams as Mermaid blocks.
