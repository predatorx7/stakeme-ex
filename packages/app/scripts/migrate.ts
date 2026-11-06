#!/usr/bin/env node

/**
 * Apply any pending migrations to the database.
 *
 *   node packages/app/scripts/migrate.ts
 *
 * Safe to run on every deploy (an ECS one-off task, a compose `migrate`
 * service): `applyMigrations` tracks what's already run in a `migrations`
 * table and only executes what's new, so a schema that's already current
 * is a fast no-op.
 *
 * Schema changes are authored as a new file under `packages/app/migrations/`
 * (see `npm run migrate:plan` in packages/app) plus a matching update to
 * `sql/ddl.sql` — the latter is a diffing reference for `pgm plan`, never
 * executed directly.
 */
import { applyMigrations } from '@messcat/pg-migrate'
import assert from 'node:assert'
import { Client } from 'pg'
import pino from 'pino'
import pgMigrateConfig from '../pg-migrate.config.ts'

// Deliberately does NOT import `src/consts.ts`: that module validates the whole
// app configuration at import time (ORG_TOKEN_KEY, signing keys, …), which
// would force this task to carry every application secret just to open a
// connection. A schema bootstrap needs one credential — the database.
const DB_URI = process.env.DB_URI
assert(DB_URI, 'DB_URI is required')

const logger = pino()

// Given a URI, pg-migrate runs each file through psql, which waits on a round
// trip per statement. A client sends each file as one query instead, which
// matters over a high-latency link such as the SSM tunnel.
const db = new Client({ connectionString: DB_URI })
await db.connect()
try {
	const applied = await applyMigrations({
		config: pgMigrateConfig,
		db,
		logger
	})
	logger.info(
		applied
			? 'migrations applied'
			: 'schema already up to date — nothing to do'
	)
} finally {
	await db.end()
}
