/**
 * Build the PGlite schema snapshot once, before `npm test` forks a process per
 * test file.
 *
 * A cold build is ~4s, and every file's `bootApp()` would otherwise do its own
 * — ~28 at once, contending for one CPU. On a constrained machine the unlucky
 * file exceeds the 120s test timeout and reports as a `before` hook failure,
 * which reads like a broken test rather than a cold cache. Warming here turns
 * that into one build plus ~0.3s restores.
 */
import { createFreshPgliteSnapshot } from '../tests/pglite.ts'
await createFreshPgliteSnapshot()
