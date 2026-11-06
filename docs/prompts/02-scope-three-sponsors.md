# 02: Scope to three sponsors

Summary reconstructed from the repository. Source: `CONTEXT.md`.

## Decision 1: MVP scope (2026-11-06)

Humans narrowed the build to four integrations for the Friday and Saturday
MVP: Reclaim, Hedera, World ID, and 0G. Chainlink CRE, Arkiv, and Arc/Whitechain
were deferred to a Sunday stretch.

## Decision 2: exactly three sponsors (2026-11-06)

This update supersedes the stretch plan. Quoted from `CONTEXT.md`:

> Exactly three sponsors: **Hedera, World ID, 0G**.

> Chainlink CRE, Arkiv, Arc, and Whitechain are deprecated: no code, no env vars, no adapter seams named after them.

Their docs moved to `docs/deprecated/`. Reclaim stays as the zkTLS proof source
that the 0G agent verifies. The ETHGlobal rule allows up to three partner
prizes, which drove the cut (`docs/prize-checklist.md`).

## Sponsor roles set by the decision

| Sponsor | Role (paraphrased from `CONTEXT.md`) |
| --- | --- |
| Hedera | Escrow and token contracts, ATS-ready equity token (Asset Tokenization Studio integration built, minting simulated), x402-style dividend payout, escrow freeze |
| World ID | v4 proof of human; nullifier blocks double IPOs and flags defaulters |
| 0G | Auditor agent on 0G Compute (opt-in), L-ISA terms and decision logs on 0G Storage, safe-stop freeze |

## Follow-up

Agents then removed the deprecated sponsors' code and moved their docs. The
status of each remaining gap is in `docs/prize-checklist.md`.
