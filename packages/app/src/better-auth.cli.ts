/**
 * Config entry point for the Better Auth schema generator, which imports a
 * module and reads its exported `auth`:
 *
 *   cd packages/app
 *   npx @better-auth/cli generate --config src/better-auth.cli.ts
 *
 * Separate from `better-auth.ts` so the server never pays for a module-scope
 * pool and top-level await on boot.
 */
import { Pool } from 'pg'
import { createAuth } from './better-auth.ts'
import { DB_URI } from './consts.ts'

export const auth = await createAuth(new Pool({ connectionString: DB_URI }))
