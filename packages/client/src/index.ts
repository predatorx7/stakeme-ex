// The root re-exports the browser-safe API surface verbatim. Add Node-only
// helpers here, never to `./api.ts`.
export * from './api.ts'
export { USER_AGENT } from './consts.ts'
