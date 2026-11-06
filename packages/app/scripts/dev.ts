import { rm } from 'fs/promises'
import { PORT } from '../src/consts.ts'
import {
	createApp,
	createPgmbClient,
	endPgmb,
	type IPgClientLike,
	LOGGER,
} from '../src/index.ts'
import { runWorkers } from '../src/worker/register.ts'
import { applyPgliteMigrations, createPglite } from '../tests/pglite.ts'

const DATA_DIR = './pg_dev_data'

if(process.argv.includes('--clear')) {
	LOGGER.info('clearing pg_dev_data...')
	await rm(DATA_DIR, { recursive: true, force: true })
}

// PGlite loads the pgmb schema from the migrations, so the worker runs against
// real pgmb here too.
const pglite = createPglite({ dataDir: DATA_DIR })
const pg = pglite as unknown as IPgClientLike

await applyPgliteMigrations(pglite, { logger: LOGGER })

const app = await createApp(pg)

const pgmb = createPgmbClient(pg)
await pgmb.init()
// pgmb's functions declare `SET search_path TO pgmb`, so after pgmb.init() the
// single persistent connection is left on `pgmb`. Restore the app schema.
await pglite.exec('SET search_path TO smx, public')
const worker = await runWorkers(pg, { pgmb })

app.listen(PORT, () => {
	LOGGER.info({ port: PORT }, 'development server started')
})

process.once('SIGINT', async() => {
	LOGGER.info('SIGINT received, shutting down development server...')
	await endPgmb()
	worker.stop()
	await app.destroy()
	await pglite.close()
	process.exit(0)
})
