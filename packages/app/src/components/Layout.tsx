import { escapeHtml, type PropsWithChildren } from '@kitajs/html'
import {
	APP_DESCRIPTION,
	APP_NAME,
	assetUrl,
	BASE_PATH,
	canonicalOrigin,
	IS_DEV,
	WALLETCONNECT_PROJECT_ID,
} from '../consts.ts'
import { clientAssets } from '../utils/client-assets.ts'
import { jsonForScript } from '../utils/escape.ts'
import { tickerItems } from '../utils/ticker-feed.ts'
import { Header, type NavKey } from './Header.tsx'
import { PAGE_SHELL_ID } from './nav-swap.ts'
import { PublicShell } from './PublicShell.tsx'
import { TickerStrip } from './TickerStrip.tsx'

/**
 * Per-page SEO + social-card metadata. Every public route fills this
 * in so the pages emit a complete
 * set of meta tags + JSON-LD on the first byte (search engines and
 * the unfurl crawlers don't run our client JS).
 */
export type SeoMeta = {
	/** Page title — composed with the site name unless `titleAbsolute`. */
	title: string
	/** Skip the site-name suffix on `title`. Used
	 *  for the homepage where the full brand belongs in the title. */
	titleAbsolute?: boolean
	/** Meta description. Falls back to a site-wide blurb when omitted. */
	description?: string
	/** Absolute canonical URL. Search engines collapse duplicates onto it. */
	canonical?: string
	/** Open Graph image URL (1200×630 recommended). */
	image?: string
	/** Alt text for the OG image — screen readers and `twitter:image:alt`. */
	imageAlt?: string
	/** Default 'website'; provider pages use 'article'. */
	ogType?: 'website' | 'article'
	/** Inline JSON-LD payloads — one per `<script>` tag in `<head>`. */
	jsonLd?: unknown[]
	/** Crawler hint. Set 'noindex' for org / `/me` / private pages. */
	robots?: 'index, follow' | 'noindex, nofollow' | 'noindex, follow'
}

type LayoutProps = PropsWithChildren<{
	/** SEO metadata for the page; emitted as `<meta>` tags + JSON-LD. */
	seo: SeoMeta
	/** Extra attributes spread onto `<body>` (data-* hooks for client JS). */
	bodyProps?: JSX.HtmlBodyTag
	/** Authenticated viewer (or `null`). Drives the header's wallet chip and
	 *  the visibility of member-only nav items. */
	viewer?: {
		id?: string
		name: string
		email: string
		walletAddress?: string | null
	} | null
	/** The active primary tab, highlighted in the header. */
	nav?: NavKey
	/** Hide the global chrome (header). The page brings its own landmarks. */
	bare?: boolean
}>

/**
 * The top-level page shell. Composes the document `<head>` (title, meta,
 * OG/Twitter, canonical, robots, JSON-LD), wires the client bundle, and renders
 * the global header above the page's children. Every browser-visible route
 * returns `<Layout>…children…</Layout>`.
 */
export function Layout(props: LayoutProps) {
	const { seo, bodyProps, viewer, nav, bare, children } = props
	const fullTitle = seo.titleAbsolute ? seo.title : `${seo.title} · ${APP_NAME}`
	const description = seo.description || APP_DESCRIPTION
	const ogType = seo.ogType || 'website'
	const robots = seo.robots || 'index, follow'
	const { js: clientJsPath, css: cssPath } = clientAssets()
	return (
		'<!doctype html>' +
		(
			<html lang='en'>
				<head>
					<meta charset='UTF-8' />
					<meta
						name='viewport'
						content='width=device-width, initial-scale=1.0'
					/>
					<meta
						name='color-scheme'
						content='light dark' />
					<title>
						{escapeHtml(fullTitle)}
					</title>
					<meta
						name='description'
						content={description} />
					<meta
						name='robots'
						content={robots} />
					{
						!!seo.canonical && (
							<link
								rel='canonical'
								href={seo.canonical} />
						)
					}
					<meta
						property='og:site_name'
						content={APP_NAME} />
					<meta
						property='og:type'
						content={ogType} />
					<meta
						property='og:title'
						content={fullTitle} />
					<meta
						property='og:description'
						content={description} />
					{
						!!seo.canonical && (
							<meta
								property='og:url'
								content={seo.canonical} />
						)
					}
					{
						!!seo.image && (
							<>
								<meta
									property='og:image'
									content={seo.image} />
								<meta
									property='og:image:width'
									content='1200' />
								<meta
									property='og:image:height'
									content='630' />
								<meta
									property='og:image:alt'
									content={seo.imageAlt || fullTitle}
								/>
								<meta
									name='twitter:card'
									content='summary_large_image' />
								<meta
									name='twitter:image'
									content={seo.image} />
							</>
						)
					}
					<meta
						name='twitter:title'
						content={fullTitle} />
					<meta
						name='twitter:description'
						content={description} />
					{
						!seo.image && (
							<>
								<meta
									property='og:image'
									content={`${canonicalOrigin()}${assetUrl('icon-512.png')}`} />
								<meta
									property='og:image:width'
									content='512' />
								<meta
									property='og:image:height'
									content='512' />
								<meta
									name='twitter:card'
									content='summary' />
								<meta
									name='twitter:image'
									content={`${canonicalOrigin()}${assetUrl('icon-512.png')}`} />
							</>
						)
					}
					<meta
						name='theme-color'
						content='#040A20' />
					<link
						rel='icon'
						href={assetUrl('favicon.ico')}
						sizes='any'
					/>
					<link
						rel='icon'
						type='image/png'
						sizes='192x192'
						href={assetUrl('icon-192.png')}
					/>
					<link
						rel='icon'
						type='image/png'
						sizes='512x512'
						href={assetUrl('icon-512.png')}
					/>
					<link
						rel='apple-touch-icon'
						href={assetUrl('apple-touch-icon.png')}
					/>
					<link
						rel='manifest'
						href={assetUrl('site.webmanifest')}
					/>
					<link
						rel='stylesheet'
						href={cssPath} />
					{
						// Public value read by client/walletconnect.ts. Not a secret.
						!!WALLETCONNECT_PROJECT_ID && (
							<meta
								name='smx-walletconnect-project-id'
								content={WALLETCONNECT_PROJECT_ID}
								data-name={APP_NAME}
								data-description={APP_DESCRIPTION}
								data-url={canonicalOrigin()}
								data-icon={`${canonicalOrigin()}${assetUrl('icon-192.png')}`} />
						)
					}
					{
						(seo.jsonLd || []).map((payload) => (
							<script type='application/ld+json'>
								{jsonForScript(payload)}
							</script>
						))
					}
				</head>
				<body
					hx-ext='response-targets'
					{...bodyProps}>
					{/*
					  * The unit the nav links swap (`NAV_SWAP`): header + page body
					  * together, so the active tab updates with the content. The
					  * bundle below deliberately sits OUTSIDE it, so the loaded JS
					  * survives a swap.
					  */}
					<div id={PAGE_SHELL_ID}>
						<PublicShell>
							{
								!bare && (
									<Header
										viewer={viewer}
										nav={nav} />
								)
							}
							{!bare && <TickerStrip items={tickerItems()} />}
							{
								// A bare page brings its own landmarks.
								bare ? children : (
									<>
										<main class='public-main'>
											{children}
										</main>
										<footer class='smx-dw-footer'>
											<small>
												{escapeHtml(APP_NAME)}
											</small>
										</footer>
									</>
								)
							}
						</PublicShell>
					</div>
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
				</body>
			</html>
		)
	)
}
