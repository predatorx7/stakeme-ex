import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { IPgClientLike } from '../src/index.ts'
import { createApp, createPgmbClient, endPgmb } from '../src/index.ts'
import { createSeededPglite } from './pglite.ts'

export type BootedApp = Awaited<ReturnType<typeof bootApp>>

/**
 * Boots the real app on an ephemeral port over a PGlite restored from the
 * migration snapshot. Call `close()` in `after`. Use one per `describe`.
 */
export async function bootApp() {
	const pglite = await createSeededPglite()
	const pg = pglite as unknown as IPgClientLike
	const app = await createApp(pg)
	const pgmb = createPgmbClient(pg)
	await pgmb.init()
	// pgmb leaves the connection on its own search_path; restore the app's.
	await pglite.exec('SET search_path TO smx, public')

	const server = await new Promise<Server>((resolve) => {
		const s = app.listen(0, () => resolve(s))
	})
	const { port } = server.address() as AddressInfo
	const origin = `http://localhost:${port}`

	return {
		origin,
		pg,
		pglite,
		/** `fetch` against the booted app. */
		fetch: (path: string, init?: RequestInit) => fetch(origin + path, init),
		async close() {
			await endPgmb()
			await app.destroy()
			await pglite.close()
		},
	}
}
