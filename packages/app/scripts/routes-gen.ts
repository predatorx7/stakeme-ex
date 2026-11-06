import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import { computeGenStamp, renderStampHeader } from './gen-stamp.ts'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const SPEC_PATH = join(SCRIPT_DIR, '..', 'openapi.yaml')
const OUT_PATH = join(
	SCRIPT_DIR, '..', '..', 'client', 'src', 'routes.gen.ts',
)
const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete']

/**
 * Emits `{ operationId -> { method, path } }` for `Client.call()`, so a new
 * operation in `openapi.yaml` works in the client with no per-op code.
 */
async function main() {
	const stamp = await computeGenStamp(SPEC_PATH)
	const spec = parse(await readFile(SPEC_PATH, 'utf8')) as {
		paths: Record<string, Record<string, { operationId?: string }>>
	}
	const routes: Record<string, { method: string, path: string }> = {}
	for(const [path, item] of Object.entries(spec.paths)) {
		for(const method of HTTP_METHODS) {
			const operationId = item[method]?.operationId
			if(operationId) {
				routes[operationId] = { method, path }
			}
		}
	}

	const header = renderStampHeader({
		generatorRelPath: 'packages/app/scripts/routes-gen.ts',
		npmScript: 'npm run openapi:gen --workspace=packages/app',
		stamp,
	}).join('\n')
	const body = Object.keys(routes).sort().map(
		(id) => `\t${JSON.stringify(id)}: ${JSON.stringify(routes[id])},`,
	).join('\n')
	await writeFile(
		OUT_PATH,
		`${header}\n\nexport const ROUTES = {\n${body}\n} as const\n\n`
		+ 'export type RouteId = keyof typeof ROUTES\n',
	)
	console.log(`wrote ${Object.keys(routes).length} routes → ${OUT_PATH}`)
}

await main()
