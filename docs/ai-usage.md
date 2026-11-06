# AI use in StakeMe Exchange (SMX)

This page discloses where and how the SMX developer used AI tools during ETHGlobal
Mumbai (November 5-7, 2026). It answers the event rule on
[Rules, project submission and judging](https://ethglobal.com/events/mumbai/info/details),
fetched 2026-11-06:

- "Clearly document in your submission where and how AI tools were used in the project."
- "AI tools should be used to assist your development process, not to create the entire project."
- "If you use one, you must include all spec files, prompts, and planning artifacts in your submission repository."
- "Judges need to see the full picture of how you directed the AI, not just the generated output."
- "Use version control to track your code during the event."

## Summary

The developer, working solo, used Claude Code (Anthropic) as an AI coding agent.
The lead agent planned the work, split it into workstreams, and delegated them
to parallel subagents. AI agents wrote most of the code, tests, and
documentation in this repository. The developer directed the product, made the
scope decisions, gave design feedback, did every step an agent cannot do, and
reviewed the results.

## Tools used

| Tool | Provider | Use |
| --- | --- | --- |
| Claude Code (CLI agent) | Anthropic | Planning, code, tests, docs, refactors, running checks and live testnet scripts |
| Claude Code subagents | Anthropic | Parallel workstreams with exclusive file ownership; implementation and doc sweeps go to Sonnet subagents (see the ownership table in [`diwali-theme.md`](diwali-theme.md#ownership)) |
| Reclaim MCP server | Reclaim | Used by the agent to build and test the mock-bank provider (capture, replay, run proof, publish) |
| Chrome DevTools MCP server | Google | Used by the agent for browser checks of the UI |

## What the developer did

This list is derived from the developer's verbatim prompts in
[`prompts/session-user-prompts.md`](prompts/session-user-prompts.md) (79
prompts). AI agents wrote most of the code; the items below are what the developer
decided, directed, set up, and checked.

- **Product concept and playbook.** Wrote the SMX idea (the liquid income share
  agreement, creator IPOs, dividends from verified income) and the master
  playbook with user journeys, sponsor roles, and a three-agent build plan.
  Prompt 1 pastes it in full. Also set the working rules: a `CONTEXT.md`
  hand-off log, docs in `docs/`, a local Docker Compose setup on a custom
  Postgres port, generators over hand-written code, tests only for core logic,
  and commits without agent authorship.
- **Scope decisions.** Cut the project to exactly three sponsors (Hedera, World
  ID, 0G), moved all integrations behind an adapter pattern, and dropped
  Chainlink, Arkiv, and Arc. Prompts 4 and 5 give the instructions.
- **Reclaim provider through the Reclaim MCP.** Asked the agent to bootstrap the
  project from the Reclaim Builder conventions, and had it build and test the
  mock-bank provider through the Reclaim MCP server.
- **Design direction and feedback.** Asked for a warm
  string-lights theme, then corrected the agents: keep the original background, use no
  festival words in the UI or source, remove the blinking indicator in the top
  bar, and run "reduce the slop" passes on the UI, UX, and presentation. Asked
  for a wallet and profile menu, Gravatar-style avatars generated from a hash of
  the user, more example users and creators, and links from dashboard widgets to
  full paginated pages.
- **Product and behavior feedback from testing.** Ran the app locally and
  reported bugs and questions: the Sybil simulation showing "verified", the
  local wallet being created when WalletConnect is closed, which wallet is used,
  whether tokens can be traded elsewhere, and what is still mocked. Decided
  what to switch to testnet and what to label as simulated.
- **Account and infrastructure work done by hand.** Signed in to the World ID
  Developer Portal; solved the Hedera and 0G faucet captchas and funded the
  testnet accounts; asked the 0G team for 0G Private Computer credits and
  confirmed they arrived; created the WalletConnect project and added the
  deployment domains to its allowlist; added the DNS records in Cloudflare for
  `stakeme.magnificlabs.org`; set up a Google Cloud billing account and set a
  spending limit for the agents. Secrets went into the gitignored `.env` by
  hand.
- **Reviewing and steering every result.** Asked what was left and what was
  blocking at each step, redirected agents when output missed the goal (for
  example "previous original background was much better"), told them to fix a
  stuck deployment, and passed on judge feedback about last year's projects so
  the pitch and docs described the project honestly.

## How the agents worked

A lead agent (the orchestrator) read `CONTEXT.md`, planned a workstream, and
gave each subagent a brief with an exclusive set of files or packages. A
subagent that wanted a change outside its files had to describe it and ask. The
subagents ran in parallel, checked their own work, and reported back in a few
lines. The lead agent merged the results, ran lint, typecheck and tests, and
updated `CONTEXT.md`. Agents don't commit or push on their own: the developer
or the lead agent commits when asked, with one-line messages. The same pattern
ran the final documentation sweep, where each agent owned a fixed set of docs
and checked its claims against the code.

The prompt log shows direction and feedback, not the agents' replies. The
agents' output is the code and docs in this repository.

## The developer's role

- Set the product direction: the liquid income share agreement (L-ISA) idea,
  the user journeys, and the pitch. See [`pitch.md`](pitch.md).
- Made the scope decisions, including cutting the project to exactly three
  sponsors: Hedera, World ID, and 0G. See `CONTEXT.md`, "Decisions".
- Gave design feedback, for example the warm theme and the wallet connection
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
| Documentation (`docs/`, `README.md`) | Agent-written and edited by the developer |
| Product and engineering direction | Developer decisions; agents wrote the specs from them |

## How the developer verified AI output

- Type checking and linting across the monorepo.
- Automated tests for the core logic.
- Live testnet runs: contracts deployed to Hedera testnet, World ID proofs
  from the Simulator, and 0G Storage uploads on Galileo. Results and known gaps
  are in `CONTEXT.md` ("Live status", "Remaining", "Known issues").
- Browser checks of the UI.
- Labels on what is simulated. See "What is real and what is
  simulated" in [`pitch.md`](pitch.md) and [`prize-checklist.md`](prize-checklist.md).

AI output can contain errors. Where a check did not run live, the docs say so.

## Where the specs, prompts, and planning artifacts live

| Artifact | Location | Role |
| --- | --- | --- |
| Engineering guide | [`engineering-guide.md`](engineering-guide.md) | Spec: architecture and code style. Wins over other docs on conflicts. |
| Product spec | [`product-spec.md`](product-spec.md) | Spec: what SMX does. |
| Hand-off log | [`../CONTEXT.md`](../CONTEXT.md) | Decisions, live status, remaining work, code maps. Each agent reads it first and updates it when done. |
| Agent rules | [`../AGENTS.md`](../AGENTS.md), `packages/app/AGENTS.md`, `packages/client/AGENTS.md`, `packages/contracts/AGENTS.md` | Rules the agents follow in this repository. |
| Pitch playbook | [`pitch.md`](pitch.md) | Product and demo plan. |
| Other planning docs | [`architecture-adapters.md`](architecture-adapters.md), [`backend.md`](backend.md), [`contracts.md`](contracts.md), [`frontend-hooks.md`](frontend-hooks.md), [`diwali-theme.md`](diwali-theme.md), [`integrations/`](integrations/README.md) | Design notes written by agents |
| All human prompts, verbatim | [`prompts/session-user-prompts.md`](prompts/session-user-prompts.md) | Every message the developer sent to the AI agent, exported from the Claude Code session log |
| Key decisions, summarized | [`prompts/`](prompts/README.md) | Short summaries of the main decisions, reconstructed from the repository |

Note on prompts: `session-user-prompts.md` is the verbatim export (79 prompts
from 2026-11-06, with email addresses, keys, and one transaction hash
redacted). Later direction is in the Git history and `CONTEXT.md`. The other files
in `docs/prompts/` are summaries reconstructed from the repository, and only
the text in quotation marks in them is quoted from a repo file.

## Version control

The work is in Git: 69 commits on 2026-11-06 and 2026-11-07. The first
commits were few and large (the bootstrap commit has 64 files); later commits
are smaller.
