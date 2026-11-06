# 01: Bootstrap

Summary reconstructed from the repository.

## Intent

Build StakeMe Exchange (SMX), "the world's first liquid stock market for human
potential" (`docs/pitch.md`), the way Reclaim Builder is built.

## Brief

The engineering guide opens with a prompt template, quoted from
`docs/engineering-guide.md`:

> Model it on the Reclaim Builder monorepo (`reclaimprotocol/builder`). Copy its
> architecture, database design, code style, theme, and organization patterns.
> When this prompt and Builder disagree, this prompt wins. When this prompt is
> silent, read Builder's code and follow the pattern you find there.

Project constants set in the brief (`AGENTS.md`): npm scope `@stakeme`, schema
`smx`, dev port 4020, Docker Postgres host port 5442.

Working rules for agents (`AGENTS.md`):

> Be clear and concise. Sacrifice grammar for brevity in comments and replies.

> Never commit or push on your own.

## Decisions recorded (`CONTEXT.md`, "Decisions")

- Architecture follows Builder (Express 5, OpenAPI, PGTyped, Kita TSX, htmx).
  The playbook's Next.js/wagmi/recharts stack is replaced.
- Contracts use Hardhat 3 and viem.
- Simulated chain mode when `CHAIN_RPC_URL` is unset, so the demo runs with no
  keys.
- "Tests only for core logic: SQL business functions, contract math."
- "Docs follow the Google developer documentation style guide."

## Product playbook

The pitch, user journeys (Ravi the honest developer, Rahul the scammer), and
the three-minute stage pitch are in `docs/pitch.md`. The product spec
(`docs/product-spec.md`) and engineering guide (`docs/engineering-guide.md`)
were written from this brief and serve as the specs.

## Hand-off

`CONTEXT.md` is the hand-off file: "Any agent picking up work reads this first".
