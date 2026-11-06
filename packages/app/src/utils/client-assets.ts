/**
 * Resolves the browser bundle's URLs for the page shells (`Layout`,
 * `IndexHtml`).
 *
 * In development the tags point at the TypeScript/CSS SOURCE and Vite's
 * middleware serves them with HMR. In production they point into
 * `public/dist`, where every filename is content-hashed — which is what lets
 * that mount be served `immutable, max-age=1y` instead of revalidating on every
 * navigation. The hash is only knowable from Vite's `manifest.json`, so read it
 * (once, lazily) rather than hardcoding a URL.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BASE_PATH, IS_PRODUCTION, PUBLIC_DIR } from '../consts.ts'
import { LOGGER } from '../logger.ts'

export interface ClientAssets {
	/** URL for the `<script type="module">` at the end of `<body>`. */
	js: string
	/** URL for the render-blocking `<link rel="stylesheet">` in `<head>`. */
	css: string
}

/** Vite's `manifest.json`, keyed by entry path relative to the Vite root. */
const JS_ENTRY = 'src/client/index.ts'
const CSS_ENTRY = 'src/client/index.css'

const DEV_ASSETS: ClientAssets = {
	js: `${BASE_PATH}${JS_ENTRY}`,
	css: `${BASE_PATH}${CSS_ENTRY}`,
}

// Last resort when the manifest is unreadable — a production image that skipped
// `vite build`. The raw stylesheet still renders the site (unbundled: one
// request per `@import`); nothing can stand in for the missing JS bundle, so
// the page degrades to no client behavior, exactly as it does today. Logged
// loudly because it is a broken build, not a mode.
const FALLBACK_ASSETS: ClientAssets = {
	js: `${PUBLIC_DIR}/dist/index.js`,
	css: `${PUBLIC_DIR}/styles/index.css`,
}

let cached: ClientAssets | undefined

function readManifest(): ClientAssets {
	const path = join(
		import.meta.dirname, '../../public/dist/.vite/manifest.json',
	)
	try {
		const manifest = JSON.parse(readFileSync(path, 'utf8')) as
			Record<string, { file?: string } | undefined>
		const js = manifest[JS_ENTRY]?.file
		const css = manifest[CSS_ENTRY]?.file
		if(!js || !css) {
			throw new Error(`manifest is missing ${js ? CSS_ENTRY : JS_ENTRY}`)
		}

		return {
			js: `${PUBLIC_DIR}/dist/${js}`,
			css: `${PUBLIC_DIR}/dist/${css}`,
		}
	} catch(err) {
		LOGGER.error(
			{ err, path },
			'client bundle manifest unreadable — run `npm run build`; '
				+ 'pages will render without their JS',
		)
		return FALLBACK_ASSETS
	}
}

/** URLs of the client JS + CSS for this env. Cached after the first call. */
export function clientAssets(): ClientAssets {
	if(!IS_PRODUCTION) {
		return DEV_ASSETS
	}

	cached ??= readManifest()
	return cached
}
