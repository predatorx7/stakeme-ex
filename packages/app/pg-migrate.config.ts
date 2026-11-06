import type { PgMigrateConfig } from '@messcat/pg-migrate'
import { join } from 'path'

const PGMB_SQL_PATH = join(
	import.meta.dirname,
	'../../node_modules/@haathie/pgmb/sql'
)

export default {
	plugins: {
		pgmb: {
			schemas: ['pgmb'],
			migrations: {
				files: [
					'pgmb-0.1.12.sql',
					'pgmb-0.1.12-0.2.0.sql',
					'pgmb-0.2.0-0.2.2.sql',
					'pgmb-0.2.0-0.2.8.sql',
					'pgmb-0.2.8-0.2.14.sql',
					'pgmb-0.2.14-0.2.15.sql',
					'pgmb-0.2.15-0.2.17.sql',
				].map(file => join(PGMB_SQL_PATH, file))
			},
			current: { files: [join(PGMB_SQL_PATH, 'pgmb.sql')] }
		},
		smx: {
			schemas: ['smx'],
			dependencies: ['pgmb'],
			migrations: {
				directory: join(import.meta.dirname, './migrations')
			},
			current: { directory: join(import.meta.dirname, './sql') },
		},
	},
	spawnDb: {
		type: 'pglite',
		contribExtensions: ['pgcrypto', 'pg_trgm', 'citext']
	}
} satisfies PgMigrateConfig
