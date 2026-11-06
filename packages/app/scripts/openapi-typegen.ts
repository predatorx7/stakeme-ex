import { writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import openapiTS, { astToString, COMMENT_HEADER } from 'openapi-typescript'
import { computeGenStamp, renderStampHeader } from './gen-stamp.ts'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const SPEC_PATH = join(SCRIPT_DIR, '..', 'openapi.yaml')
const OUT_PATH = join(
	SCRIPT_DIR,
	'..',
	'..',
	'client',
	'src',
	'types',
	'openapi.gen.ts',
)

/**
 * Thin wrapper around openapi-typescript's programmatic API — used instead of
 * its CLI so the output can be stamped with the spec version + content hash
 * (see `gen-stamp.ts`). Calls `openapiTS`/`astToString` the same way the CLI
 * does for a plain `openapi-typescript <file> --output <file>` invocation (no
 * extra flags, no redocly.yaml in this repo), so the generated types
 * themselves are unchanged from what the CLI would produce; only the header
 * gains the stamp.
 */
async function main() {
	const stamp = await computeGenStamp(SPEC_PATH)

	const ast = await openapiTS(pathToFileURL(SPEC_PATH))
	const header = renderStampHeader({
		generatorRelPath: 'packages/app/scripts/openapi-typegen.ts',
		npmScript: 'npm run openapi:gen --workspace=packages/app',
		stamp,
	}).join('\n')

	const out = `${header}\n${COMMENT_HEADER}${astToString(ast)}`
	await writeFile(OUT_PATH, out)
	console.log(
		`wrote openapi types (spec v${stamp.specVersion}, ` +
			`${stamp.sourceHash}) → ${OUT_PATH}`,
	)
}

await main()
