# AI use in StakeMe Exchange (SMX)

This page states where and how the SMX developer used AI tools during ETHGlobal
Mumbai (November 5-7, 2026).

## Summary

The developer, working solo, used Claude Code (Anthropic) as an AI coding agent.
AI agents wrote most of the code, tests, and documentation in this repository.
The developer directed the product, made the scope decisions, gave design
feedback, did every step an agent cannot do (accounts, captchas, faucets,
sign-ins, secrets), and reviewed the results.

## Tools used

| Tool | Provider | Use |
| --- | --- | --- |
| Claude Code (CLI agent) | Anthropic | Planning, code, tests, docs, refactors, running checks and live testnet scripts |
| Claude Code subagents | Anthropic | Parallel workstreams with exclusive file ownership |
| Reclaim MCP server | Reclaim | Used by the agent to build and test the mock-bank provider |
| Chrome DevTools MCP server | Google | Used by the agent for browser checks of the UI |

## Multi-agent workflow

A lead agent read `CONTEXT.md`, planned a workstream, and gave each subagent a
brief with an exclusive set of files or packages. A subagent that wanted a change
outside its files had to describe it and ask. Subagents ran in parallel, checked
their own work, and reported back briefly. The lead agent merged the results,
ran lint, typecheck, and tests, and updated `CONTEXT.md`. Agents commit only
when the developer asks.

## What AI generated

| Area | AI role |
| --- | --- |
| Application code (`packages/app`, `packages/client`) | Most of it, following the Reclaim Builder architecture |
| Smart contracts (`packages/contracts`) | Drafted by agents; contract math covered by tests |
| SQL, migrations, OpenAPI | Agent-written |
| Integrations (Hedera, World ID, 0G, Reclaim) | Agent-written from sponsor docs |
| Tests | Agent-written, for core logic only |
| Documentation (`docs/`, `README.md`) | Agent-written and edited by the developer |
| Product and engineering direction | Developer decisions; agents wrote the specs from them |

## How the developer verified AI output

- Type checking and linting across the monorepo.
- Automated tests for the core logic.
- Live testnet runs on Hedera, World ID, and 0G. Results and known gaps are in
  `CONTEXT.md`.
- Browser checks of the UI.
- Labels on what is simulated. See [`pitch.md`](pitch.md) and
  [`prize-checklist.md`](prize-checklist.md).

AI output can contain errors. Where a check did not run live, the docs say so.

## Specs and planning artifacts

| Artifact | Location |
| --- | --- |
| Engineering guide | [`engineering-guide.md`](engineering-guide.md) |
| Product spec | [`product-spec.md`](product-spec.md) |
| Hand-off log | [`../CONTEXT.md`](../CONTEXT.md) |
| Agent rules | [`../AGENTS.md`](../AGENTS.md) and each `packages/*/AGENTS.md` |
| Pitch playbook | [`pitch.md`](pitch.md) |
