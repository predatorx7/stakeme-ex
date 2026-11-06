import { join } from 'node:path'
import { defineConfig } from 'vite'

/**
 * Browser bundle for the server-rendered pages (see `Layout.tsx`). Two entries:
 * the JS (`src/client/index.ts`) and the stylesheet (`src/client/index.css`,
 * which `@import`s `public/styles/*`).
 *
 * The CSS entry matters for more than minification. `public/styles/index.css`
 * is a list of 16 `@import`s; served raw, the browser cannot discover them
 * until that file lands, nor the `@font-face` files until `fonts.css` lands —
 * three serialized round trips of render-blocking CSS on EVERY navigation.
 * Vite inlines the imports into a single file, so it becomes one.
 *
 * Filenames are content-hashed so `/public/dist` can be served
 * `immutable, max-age=1y` (see the static mount in `app.ts`); the server maps
 * entry → hashed filename through `manifest.json` (`utils/client-assets.ts`).
 * Never hardcode a `/public/dist/...` URL.
 */
export default defineConfig({
	root: join(import.meta.dirname, '.'),
	// `publicDir` defaults to `<root>/public` — which CONTAINS outDir here, so
	// the default copy step duplicates every font/icon/stylesheet into
	// `public/dist/` (7MB of shadow copies that nothing serves).
	publicDir: false,
	// The URL `public/dist` is mounted at. Required, not cosmetic: Vite
	// fingerprints the `@font-face` files the stylesheet references and rewrites
	// those urls against `base`, so the default '/' emits
	// `url(/plex-400-<hash>.woff2)` — a 404, since the file is served from
	// `/public/dist/`. Only the BUILD reads this file; the dev server is
	// configured inline in `app.ts` with `base: BASE_PATH`.
	base: '/public/dist/',
	build: {
		outDir: 'public/dist',
		emptyOutDir: true,
		manifest: true,
		ssrEmitAssets: false,
		rollupOptions: {
			input: {
				index: join(import.meta.dirname, 'src/client/index.ts'),
				styles: join(import.meta.dirname, 'src/client/index.css'),
			},
			platform: 'browser',
			output: {
				entryFileNames: '[name]-[hash].js',
				chunkFileNames: '[name]-[hash].js',
				assetFileNames: 'assets/[name]-[hash].[ext]',
			},
		},
	},
})
