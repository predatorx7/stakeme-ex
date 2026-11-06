/**
 * The server entry point: HTTP listener plus the background workers, in one
 * process.
 *
 * It lives in `src/` (not `scripts/`) so `tsc` compiles it into `lib/`, which
 * is what production runs:
 *
 *   node packages/app/lib/server.js
 *
 * That matters: route modules resolve next to the running `app` module, and 45
 * of them are `.tsx`. Node's type stripping handles `.ts` but cannot load JSX,
 * so a server started from `src/` returns 500 for every HTML page while the
 * JSON routes look fine. Everything in `lib/` is already `.js`.
 *
 * Development is unaffected — `scripts/start.ts` runs the same thing through
 * Vite, which does transform `.tsx`.
 */
// otel has to be imported before any other modules that use any
// instrumented libraries
import './otel.ts'
import { runWorkers } from './worker/register.ts'
import {
	createApp,
	createPgmbClient,
	endPgmb,
	initPgmbPool,
	initPgPool,
	LOGGER,
} from './index.ts'

const PORT = +(process.env.PORT || 4020)
// Backstop for the WHOLE shutdown — HTTP drain, workers, pgmb and the pool.
// Distinct from GRACEFUL_SHUTDOWN_TIMEOUT_S, which only bounds how long
// `app.destroy()` waits on in-flight connections. Keep this above that one and
// below the orchestrator's kill delay (ECS `stopTimeout`, default 30s), so the
// process exits on its own terms rather than being SIGKILLed part-way through.
const SHUTDOWN_GRACE_MS = +(process.env.SHUTDOWN_GRACE_MS || 20_000)

// Runs on import — this module is an entry point, not a library. It is
// deliberately NOT re-exported from `src/index.ts`, so importing the package
// never starts a listener.
await startServer()

async function startServer() {
	const db = initPgPool()
	const app = await createApp(db)

	// Callback (webhook) delivery: pgmb client + the reliable handler that
	// drains `callback.delivery` events. On its OWN pool — see `initPgmbPool`.
	const pgmbPool = initPgmbPool()
	const pgmb = createPgmbClient(pgmbPool)
	await pgmb.init()
	const worker = await runWorkers(db, { pgmb })

	app.listen(PORT, () => {
		LOGGER.info({ port: PORT }, 'server started')
	})

	// SIGTERM is how a container runtime stops a task (ECS, Kubernetes,
	// `docker stop`); SIGINT is Ctrl-C. Both mean the same thing here.
	let shuttingDown = false
	for(const signal of ['SIGTERM', 'SIGINT'] as const) {
		process.once(signal, () => void shutdown(signal))
	}

	/**
	 * Stop accepting work, let what's in flight finish, then release everything.
	 *
	 * `app.destroy()` goes first and does the HTTP side itself — it closes the
	 * listener (so the load balancer's health check starts failing and no new
	 * request lands), then drains idle connections and force-closes the
	 * stragglers. Only once nothing is being served do the workers and the pool
	 * go, so an in-flight request never loses its database mid-flight.
	 *
	 * A hard timer bounds the whole thing: one stuck step must not keep the task
	 * alive until the orchestrator SIGKILLs it, since that would abandon the
	 * pgmb and pool cleanup entirely.
	 */
	async function shutdown(signal: string) {
		if(shuttingDown) {
			return
		}

		shuttingDown = true
		LOGGER.info({ signal }, 'shutting down')
		const forced = setTimeout(() => {
			LOGGER.error(
				{ graceMs: SHUTDOWN_GRACE_MS }, 'shutdown timed out, exiting',
			)
			process.exit(1)
		}, SHUTDOWN_GRACE_MS)
		// Don't let the timer itself hold the event loop open once we're done.
		forced.unref()

		try {
			await app.destroy()
			worker.stop()
			await endPgmb()
			await Promise.all([db.end(), pgmbPool.end()])
			LOGGER.info('shutdown complete')
			process.exit(0)
		} catch(err) {
			LOGGER.error({ err }, 'shutdown failed')
			process.exit(1)
		}
	}
}
