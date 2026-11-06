import { PGlite, type PGliteOptions } from '@electric-sql/pglite'
import { btree_gin } from '@electric-sql/pglite/contrib/btree_gin'
import { citext } from '@electric-sql/pglite/contrib/citext'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import {
	applyMigrations,
	type ApplyMigrationsOptions,
} from '@messcat/pg-migrate'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'node:path'
import pgMigrateConfig from '../pg-migrate.config.ts'

export const SNAPSHOT_FILE_NAME = join(
	import.meta.dirname,
	'../pglite-snapshot.gz',
)

export function createPglite(opts: PGliteOptions = {}) {
	return new PGlite({
		...opts,
		extensions: { ...opts.extensions, btree_gin, citext, pg_trgm, pgcrypto },
	})
}

/** Apply the repository migration config without importing a Windows drive
 * path as an ESM URL. */
export async function applyPgliteMigrations(
	pglite: PGlite,
	options: Pick<ApplyMigrationsOptions, 'logger'> = {},
) {
	return await applyMigrations({
		...options,
		config: pgMigrateConfig,
		db: pglite,
	})
}

export async function createFreshPgliteSnapshot() {
	const pglite = createPglite()
	try {
		await applyPgliteMigrations(pglite)
		const dump = await pglite.dumpDataDir('gzip')
		const arraybuffer = await dump.arrayBuffer()
		await writeFile(SNAPSHOT_FILE_NAME, new Uint8Array(arraybuffer))
	} finally {
		await pglite.close()
	}

	console.log(`Wrote snapshot to ${SNAPSHOT_FILE_NAME}`)
}

/**
 * A PGlite with the schema and seeds already in it, restored from the snapshot
 * (built on first use). Prefer this over `createPglite` + `loadDdlForDev` in
 * tests.
 */
export async function createSeededPglite() {
	const data = await readFile(SNAPSHOT_FILE_NAME)
	return createPglite({ loadDataDir: new Blob([data]) })
}
