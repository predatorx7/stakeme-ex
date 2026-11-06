# Working in this repository

StakeMe Exchange (SMX) is an ETHGlobal hackathon project: a liquid stock market
for human potential. The architecture follows Reclaim Builder.

Before you start, read these, in order:

1. [`CONTEXT.md`](CONTEXT.md): hand-off state, decisions, skeleton map.
2. [`docs/product-spec.md`](docs/product-spec.md): what SMX does.
3. [`docs/engineering-guide.md`](docs/engineering-guide.md): architecture and
   code style. It wins over this file on conflicts.
4. Every `packages/*/AGENTS.md`.

Be clear and concise. Sacrifice grammar for brevity in comments and replies. Do
as much work in SQL as possible; use TypeScript only for orchestration. Follow
best practices for security, performance, and maintainability. When in doubt,
follow the existing code patterns.

Don't ask the user to run a command you can run yourself.

**Never commit or push on your own.** Commit only when the user explicitly asks.

## Constants

| Name | Value |
| --- | --- |
| npm scope | `@stakeme` |
| Postgres schema | `smx` |
| Dev server port | `4020` |
| Docker Postgres host port | `5442` (container `5432`) |
| Node | 24 (`.nvmrc`) |

## Commands

Run these from the repository root.

| Command | Does |
| --- | --- |
| `npm install` | Install all workspaces. |
| `npm run db:up` / `db:down` | Start or stop the local Docker Postgres. |
| `npm run dev` | Dev server on PGlite (`packages/app/pg_dev_data`) at http://localhost:4020 |
| `npm run gen` | PGTyped (needs `db:up`) and OpenAPI codegen. |
| `npm run gen:check` | Fail when generated files are stale. |
| `npm run migrate:plan` | Generate a migration from `sql/ddl.sql`. |
| `npm run check` | Typecheck and XSS scan. |
| `npm run lint:fix` | ESLint with autofix. |
| `npm test` | Run every workspace's tests. |

## Writing code

- Use tabs for indentation, not spaces (YAML and JSON use two spaces).
- If a change in another package eases development, describe the change,
  explain why, and ask for permission. Packages and files have exclusive owners
  during multi-agent work; see `CONTEXT.md`.

### TypeScript

- Import relative files with the `.ts` extension.
- Use the `#` prefix for private class members.
- Infer types. Annotate only to resolve ambiguity.
- Run TypeScript directly with `node` (type stripping).
- Declare nested functions at the end of their parent function.
- Use `@hapi/boom` for coded errors. Don't create custom error classes.
- Import across packages only through `@stakeme/<package>`. The one exception
  is test utilities, in test files.
- Use `assert(cond, boomError)` instead of `if (!cond) throw`.
- Don't cast unless unavoidable, and then explain why in a comment. Never use
  `as any` or `as unknown` without a reason.
- Use `||=` and `??=` for optional assignment.
- Don't use `console.log` in app code. Use `LOGGER`.
- Run lint and typecheck from the root before you report a task done.

### SQL

- Write all SQL in `.sql` files in a package's `sql/` folder. No inline SQL in
  TypeScript.
- Put business logic in SQL functions. Call them from `queries.sql`.
- Insert composites with `jsonb_populate_record(null::t, :data::jsonb)`. Read
  them with `to_jsonb(t)`.
- Edit `sql/ddl.sql` (desired state), then run `npm run migrate:plan`. Ship one
  migration per change. Then run `npm run pgtyped:typegen`.

### Tests

- Use the native Node.js test runner. Run one file with `node --test <file>`
  and one case with `--test-name-pattern`.
- Test behavior end to end through `bootApp()`. Don't add a test for B when a
  test for A already covers A, B, and C, unless B has an uncovered edge case.
- Test only core logic (SQL business functions, contract math). No broad UI or
  e2e suites.

### Docs

Follow the Google developer documentation style guide: second person, present
tense, active voice, sentence-case headings, no "please".
