import { escapeHtml, type PropsWithChildren } from '@kitajs/html'
import { assetUrl, BASE_PATH, IS_DEV } from '../consts.ts'
import { clientAssets } from '../utils/client-assets.ts'

type IndexHtmlProps = PropsWithChildren<{
	/** `<title>` text. Use the page-level title — `Layout` composes
	 *  the SEO suffix on top of this. */
	title: string
}>

/**
 * Bare-bones HTML document: `<head>` and `<body>` with the client script and
 * stylesheet wired in. Error pages use it because they must render without
 * `Layout`'s database-backed banners and navigation.
 *
 * In development the script and stylesheet come from the TypeScript source
 * (Vite serves it with HMR); in production from the content-hashed bundle
 * under `public/dist/` (see `utils/client-assets.ts`).
 */
export function IndexHtml({ title, children }: IndexHtmlProps) {
	const { js: clientJsPath, css: cssPath } = clientAssets()
	return (
		<html lang='en'>
			<head>
				<meta charset='UTF-8' />
				<meta
					name='viewport'
					content='width=device-width, initial-scale=1.0' />
				<link
					rel='icon'
					id='favicon'
					href={assetUrl('favicon.ico')} />
				<meta
					name='color-scheme'
					content='light dark' />
				<title>
					{escapeHtml(title)}
				</title>
				<link
					rel='stylesheet'
					href={cssPath} />
			</head>
			<body hx-ext='response-targets'>
				{
					IS_DEV && (
						<script
							src={`${BASE_PATH}@vite/client`}
							type='module'
							defer />
					)
				}
				<script
					src={clientJsPath}
					type='module'
					defer />
				{children}
			</body>
		</html>
	)
}
