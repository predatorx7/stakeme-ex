# AI use in StakeMe Exchange (SMX)

This page discloses where and how the SMX team used AI tools during ETHGlobal
Mumbai (November 5-7, 2026). It answers the event rule on
[Rules, project submission and judging](https://ethglobal.com/events/mumbai/info/details),
fetched 2026-11-06:

- "Clearly document in your submission where and how AI tools were used in the project."
- "AI tools should be used to assist your development process, not to create the entire project."
- "If you use one, you must include all spec files, prompts, and planning artifacts in your submission repository."
- "Judges need to see the full picture of how you directed the AI, not just the generated output."
- "Use version control to track your code during the event."

## Summary

The team used **Claude Code** (Anthropic) as an AI coding agent. The lead
agent planned the work, split it into workstreams, and delegated them to
parallel subagents. Most of the code, tests, and documentation in this
repository was written by AI agents. Humans directed the product, made the
scope decisions, gave design feedback, did every step an agent cannot do, and
reviewed the results.

## Tools used

| Tool | Provider | Use |
| --- | --- | --- |
| Claude Code (CLI agent) | Anthropic | Planning, code, tests, docs, refactors, running checks and live testnet scripts |
| Claude Code subagents | Anthropic | Parallel workstreams with disjoint file ownership (see [Workstreams](../CONTEXT.md#workstreams) and the agent ownership table in [`diwali-theme.md`](diwali-theme.md#ownership)) |
| Reclaim MCP server | Reclaim | Used by the agent to build and test the mock-bank provider (capture, replay, run proof, publish) |
| Chrome DevTools MCP server | Google | Used by the agent for browser checks of the UI |

## What humans did

- Set the product direction: the liquid income share agreement (L-ISA) idea,
  the user journeys, and the pitch. See [`pitch.md`](pitch.md).
- Made the scope decisions, including cutting the project to exactly three
  sponsors: Hedera, World ID, and 0G. See `CONTEXT.md`, "Scope update 2".
- Gave design feedback, for example the Diwali theme and the wallet connection
  flow. See [`prompts/`](prompts/README.md).
- Created every account and project: sponsor developer portals, the Reclaim
  org, the WalletConnect project, and the testnet accounts.
- Did the steps that need a person: captchas, faucet claims, and sign-ins.
- Funded the testnet account and kept secrets in the gitignored `.env`.
- Reviewed results, ran the app, and decided what to fix or drop.

## What AI generated

| Area | AI role |
| --- | --- |
| Application code (`packages/app`, `packages/client`) | Most of it, following the Reclaim Builder architecture |
| Smart contracts (`packages/contracts`) | Drafted by agents; contract math covered by tests |
| SQL, migrations, OpenAPI | Agent-written |
| Integrations (Hedera, World ID, 0G, Reclaim) | Agent-written from sponsor docs |
| Tests | Agent-written, for core logic only (SQL business functions, contract math) |
| Documentation (`docs/`, `README.md`) | Agent-written and human-edited |
| Product and engineering direction | Human decisions; agents wrote the specs from them |

## How we verified AI output

- Type checking and linting across the monorepo.
- Automated tests for the core logic.
- Live testnet runs: contracts deployed to Hedera testnet, World ID proofs
  from the Simulator, and 0G Storage uploads on Galileo. Results and known gaps
  are in `CONTEXT.md` ("Live testnet status", "Remaining", "Known issues").
- Browser checks of the UI.
- Honest labeling of what is simulated. See "What is real and what is
  simulated" in [`pitch.md`](pitch.md) and [`prize-checklist.md`](prize-checklist.md).

AI output can contain errors. Where a check did not run live, the docs say so.

## Where the specs, prompts, and planning artifacts live

| Artifact | Location | Role |
| --- | --- | --- |
| Engineering guide | [`engineering-guide.md`](engineering-guide.md) | Spec: architecture and code style. Wins over other docs on conflicts. |
| Product spec | [`product-spec.md`](product-spec.md) | Spec: what SMX does. |
| Hand-off log | [`../CONTEXT.md`](../CONTEXT.md) | Decisions, scope updates, workstreams, status. Each agent reads it first and updates it when done. |
| Agent rules | [`../AGENTS.md`](../AGENTS.md), `packages/app/AGENTS.md`, `packages/client/AGENTS.md`, `packages/contracts/AGENTS.md` | Rules the agents follow in this repository. |
| Pitch playbook | [`pitch.md`](pitch.md) | Product and demo plan. |
| Other planning docs | [`architecture-adapters.md`](architecture-adapters.md), [`backend.md`](backend.md), [`contracts.md`](contracts.md), [`frontend-hooks.md`](frontend-hooks.md), [`diwali-theme.md`](diwali-theme.md), [`integrations/`](integrations/README.md) | Design notes written by agents |
| Key human prompts and decisions | [`prompts/`](prompts/README.md) | Written records, reconstructed from the repository |

Note on prompts: the chat transcripts are not stored in the repository. The
files in `docs/prompts/` are summaries reconstructed from the repository, and
only the text in quotation marks is quoted from a repo file.

## Version control

The work is committed to Git in small steps. Earlier commits were few and
large; the team commits in smaller steps from now on.
