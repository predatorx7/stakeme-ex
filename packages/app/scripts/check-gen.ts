import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
	computeGenStamp,
	type GenStamp,
	parseStampFromHeader
} from './gen-stamp.ts'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const SPEC_PATH = join(SCRIPT_DIR, '..', 'openapi.yaml')

// Every file `openapi:gen` writes, relative to the repo root, for the error
// message.
const GENERATED_FILES = [
	join(SCRIPT_DIR, '..', '..', 'client', 'src', 'types', 'openapi.gen.ts'),
	join(SCRIPT_DIR, '..', '..', 'client', 'src', 'routes.gen.ts'),
]

/**
 * Compare each generated file's stamped header against the spec's current
 * stamp, given the file's contents (or `null` if it doesn't exist). Pure —
 * no file IO — so it can be unit-tested without touching the real generated
 * files.
 *
 * Comparing every file against the SAME current spec stamp — rather than
 * cross-checking the files against each other — is what catches a partial
 * regeneration: if only `openapi:typegen` ran after a spec change,
 * `openapi.gen.ts`'s stamp matches the current spec but `routes.gen.ts` and
 * `operations.gen.ts` still carry the previous one, so those two fail even
 * though nobody edited `openapi.yaml` a second time.
 */
export function checkDrift(
	current: GenStamp,
	files: Array<{ path: string, contents: string | null }>,
): string[] {
	const failures: string[] = []

	for(const { path, contents } of files) {
		if(contents === null) {
			failures.push(
				`${path}: file does not exist — run \`npm run openapi:gen ` +
					'--workspace=packages/app`',
			)
			continue
		}

		const stamp = parseStampFromHeader(contents)
		if(!stamp) {
			failures.push(
				`${path}: no drift stamp found in header ` +
					'(hand-edited, or predates stamping)',
			)
			continue
		}

		const isStale = stamp.specVersion !== current.specVersion ||
			stamp.sourceHash !== current.sourceHash
		if(isStale) {
			failures.push(
				`${path}: stale — stamped spec v${stamp.specVersion} ` +
					`(${stamp.sourceHash}), openapi.yaml is now ` +
					`v${current.specVersion} (${current.sourceHash})`,
			)
		}
	}

	return failures
}

/**
 * Drift check for the OpenAPI-derived generated files: recompute the stamp
 * (spec version + content hash) from the current `openapi.yaml`, and compare
 * it against what each checked-in generated file declares in its header. A
 * mismatch means the file is stale — `openapi.yaml` changed since it was last
 * regenerated, or only some of the generators re-ran — or the file was
 * hand-edited and lost its stamp entirely.
 *
 * Run via `npm run gen:check`.
 */
async function main() {
	const current = await computeGenStamp(SPEC_PATH)
	const files = await Promise.all(
		GENERATED_FILES.map(async(path) => ({
			path,
			contents: await readFile(path, 'utf8').catch(() => null),
		})),
	)
	const failures = checkDrift(current, files)

	if(failures.length) {
		console.error(
			'gen:check failed — generated files are out of date with ' +
				'openapi.yaml:\n',
		)
		for(const failure of failures) {
			console.error(`  - ${failure}`)
		}

		console.error(
			'\nRun `npm run openapi:gen --workspace=packages/app` and commit ' +
				'the result.',
		)
		process.exit(1)
	}

	console.log(
		'gen:check: all generated files match openapi.yaml ' +
			`(spec v${current.specVersion}, ${current.sourceHash})`,
	)
}

// Run the check only when invoked as a script, not when imported by tests.
if(
	process.argv[1] &&
	resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	await main()
}
