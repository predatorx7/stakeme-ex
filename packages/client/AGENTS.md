# packages/client

Typed SDK for `@stakeme/app`. It has one job: provide a type-safe `Client`
that maps every OpenAPI operation to a fetch call.

Inherit the repo-wide rules from the root `AGENTS.md`.

## Role

SDK only. No server code, no CLI. Use `@stakeme/client/api` for browsers and
API-only code; it must stay free of Node-only imports. The package root
re-exports the exact `/api` surface. Don't add compatibility wrappers,
duplicate transport classes, or duplicate schema types.

```ts
import { Client } from '@stakeme/client/api'

const client = new Client({ baseUrl: 'http://localhost:4020' })
const { data } = await client.call('GetHome')
```

## Source of truth

`packages/app/openapi.yaml`. Run:

```bash
npm run openapi:gen --workspace=packages/app
```

The generators live in `packages/app/scripts` and write into this package:
`src/types/openapi.gen.ts` (types) and `src/routes.gen.ts` (the
`operationId` to `{ method, path }` map). Both carry a drift stamp that
`npm run gen:check` verifies. A new operation works in `Client.call()` with no
other change.

## Layout

```
src/
  api.ts            Browser-safe public entry point
  index.ts          Package root; re-exports api.ts
  client.ts         The Client class (one shared OpenAPI transport)
  errors.ts         Browser-safe, Boom-compatible RFC 9457 errors
  consts.ts         DEFAULT_BASE_URL, USER_AGENT, PROBLEM_CONTENT_TYPE
  routes.gen.ts     GENERATED
  types/
    openapi.gen.ts  GENERATED
    openapi.ts      IOperationId, IOperationArgs<T>, IOperationResponse<T>
    index.ts        Re-exports
```

`package.json` points `types` at `src/` so the app typechecks without building
this package first; `import` points at `lib/` (`npm run build`).

## Writing code

1. Tabs for indentation. `.ts` extension on every relative import.
2. Browser-safe modules must not import `node:assert` or `@hapi/boom`.
3. Don't use `as unknown` or `as any`. Fix the boundary type or add a runtime
   guard.
4. Validation stays in the OpenAPI spec. Validate only untrusted response
   boundaries that TypeScript can't check, such as problem JSON.
