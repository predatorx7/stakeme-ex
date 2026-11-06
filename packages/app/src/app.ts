import type { PgmbClient } from '@haathie/pgmb'
import { badRequest, notFound, notImplemented } from '@hapi/boom'
import { toNodeHandler } from 'better-auth/node'
import express, {
	type NextFunction,
	type Request,
	type RequestHandler,
	type Response,
} from 'express'
import { middleware } from 'express-openapi-validator'
import type {
	OpenApiRequestMetadata
} from 'express-openapi-validator/dist/framework/types.js'
import multer from 'multer'
import assert from 'node:assert'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { createServer } from 'node:http'
import { join, sep } from 'node:path'
import { setTimeout } from 'node:timers/promises'
import { pinoHttp } from 'pino-http'
import { parse } from 'qs'
import type { PluginOption, ViteDevServer } from 'vite'
import type ErrorPage from './routes/ErrorPage.tsx'
import type { IAuthenticatedUser, IPgClientLike } from './types/index.ts'
import { mapError } from './utils/map-error.ts'
import { requireAuth, resolveViewer } from './auth.ts'
import { type Auth, createAuth } from './better-auth.ts'
import {
	AUTH_BASE_PATH,
	BASE_PATH,
	betterAuthSecret,
	GRACEFUL_SHUTDOWN_TIMEOUT_S,
	IS_PRODUCTION,
} from './consts.ts'
import { LOGGER } from './logger.ts'
import { peekPgmbClient } from './pgmb.ts'

declare module 'http' {
	interface SmxOpenApiRequestMetadata extends OpenApiRequestMetadata {
		schema: OpenApiRequestMetadata['schema'] & {
			'x-auth-message'?: string
		}
	}

	interface IncomingMessage {
		/** Raw request bytes, kept by the json parser's `verify` hook for
		 *  signature-verified receivers (webhooks). */
		rawBody?: Buffer
		/**
		 * Database connection (shared pool — NOT scoped to the current
		 * user at the DB level). Authorization is enforced per query:
		 * every query takes the viewer id and filters via helpers like
		 * `user_can_own_org` (no RLS / per-request role).
		 */
		pg: IPgClientLike
		/** The app's Better Auth instance (built once in `createApp`, shares
		 *  `pg`). Used by `resolveViewer`/`Logout` to read the session. */
		auth: Auth
		requestId: string
		operationName?: string
		vite?: ViteDevServer
		openapi?: SmxOpenApiRequestMetadata
		authMetadata?: IAuthenticatedUser
		/** Callback-delivery broker. Attached here (not imported per-route) so
		 *  the singleton survives the route layer being loaded in a separate
		 *  Vite module graph. */
		pgmb: PgmbClient
	}
}

declare global {
	namespace Express {
		interface Application {
			pg: IPgClientLike
			destroy(): Promise<void>
		}
	}
}

const SPEC_PATH = join(import.meta.dirname, '../openapi.yaml')
const MOD_EXTS = ['.tsx', '.ts', '.js']
const GRACEFUL_SHUTDOWN_TIMEOUT_MS = GRACEFUL_SHUTDOWN_TIMEOUT_S * 1000

// used only for testing
export const OVERRIDE_HANDLERS: { [opId: string]: RequestHandler } = {}

export async function createApp(
	pg: IPgClientLike
) {
	assert(betterAuthSecret(), 'BETTER_AUTH_SECRET is required')
	const auth: Auth = await createAuth(pg)
	const app = express()
	const server = createServer(app)
	app.pg = pg

	// The documented APIs are callable from any website. Authentication and
	// authorization still happen at each operation; CORS is not an
	// access-control boundary. Deliberately omit Access-Control-Allow-Credentials
	// so a foreign origin cannot use the session cookie.
	app.use((req, res, next) => {
		const requestedHeaders = req.header('Access-Control-Request-Headers')
		res.setHeader('Access-Control-Allow-Origin', '*')
		res.setHeader(
			'Access-Control-Allow-Methods',
			'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS',
		)
		res.setHeader(
			'Access-Control-Allow-Headers',
			requestedHeaders ?? [
				'Accept', 'Authorization', 'Content-Type', 'Idempotency-Key',
				'If-Match', 'X-Request-Id',
			].join(', '),
		)
		if(requestedHeaders) {
			res.vary('Access-Control-Request-Headers')
		}

		res.setHeader(
			'Access-Control-Expose-Headers',
			'Content-Type, ETag, Location, X-Request-Id',
		)
		res.setHeader('Access-Control-Max-Age', '86400')
		if(req.method === 'OPTIONS') {
			res.status(204).end()
			return
		}

		next()
	})

	app.use((req, _res, next) => {
		req.pg = app.pg
		next()
	})

	app.set('query parser', parseQuery)
	app.get('/healthz', (_req, res) => res.status(200).end('ok'))
	// Better Auth owns everything under AUTH_BASE_PATH (SIWE nonce and verify,
	// session, sign-out). Mounted BEFORE the JSON body parser — the handler
	// needs the raw request stream. These routes are intentionally absent from
	// openapi.yaml; this mount short-circuits before the validator.
	app.all(`${AUTH_BASE_PATH}/{*any}`, toNodeHandler(auth))
	// `verify` stashes the raw body so signature-verified receivers (webhooks)
	// can check the signature against the exact bytes.
	app.use(express.json({
		limit: '4mb',
		verify(req, _res, buf) {
			req.rawBody = buf
		},
	}))
	app.use(express.urlencoded({ limit: '4mb', extended: true }))
	// Multipart bodies are parsed by express-openapi-validator's
	// built-in multer integration further down — no separate parser
	// here. See `fileUploader` option below.
	// attach the pool as req.pg so route handlers (and the auth middleware)
	// can use it via the per-request shape.
	app.use((req, _res, next) => {
		req.pg = pg
		req.auth = auth
		// Attached when callback delivery is wired (it powers the publish path);
		// embedders that mount the app without pgmb still serve other routes.
		const pgmb = peekPgmbClient()
		if(pgmb) {
			req.pgmb = pgmb
		}

		next()
	})
	// best-effort viewer resolution. Routes that strictly require auth
	// can call resolveViewer + assert themselves.
	app.use(async(req, _res, next) => {
		try {
			await resolveViewer(req)
			next()
		} catch{
			// invalid tokens are not fatal — handlers decide.
			next()
		}
	})

	// generate request ID
	app.use((req, res, next) => {
		const requestId = req.headers['x-request-id']
		req.requestId ||=
			typeof requestId === 'string'
				? // limit length to prevent abuse
				requestId.slice(0, 64)
				: randomUUID()
		next()
	})

	app.use(
		pinoHttp({
			logger: LOGGER,
			redact: {
				paths: [
					'req.headers.authorization',
					'req.headers.cookie',
					'req.query.accessToken',
					'req.body.signature',
					'res.body.token',
				],
			},
			serializers: {
				req(req) {
					return { ...req, body: req.raw.body }
				},
				res(res) {
					let body: unknown
					if(res.raw.locals?.bodyStr) {
						try {
							body = JSON.parse(res.raw.locals.bodyStr)
						} catch{}
					} else {
						body = res.raw.locals?.body
					}

					return { ...res, body }
				},
			},
			customReceivedMessage: () => 'incoming request',
			customReceivedObject: (req, res, val = {}) => {
				val.req = req
				return val
			},
			customErrorObject: (req, res, err, val) => {
				// if we had an error but this is not a modifying request,
				// the request wasn't logged before, so add request info now
				if(!isModifyingRequest(req)) {
					val.req ||= req
				} else {
					val.reqId ||= req.requestId
					val.authMetadata = req.authMetadata
				}

				return val
			},
			customSuccessObject: (req, res, val) => {
				val.authMetadata = req.authMetadata
				val.res ||= {}
				return val
			},
			genReqId: (req) => req.requestId,
			customLogLevel: (req, res, err) => {
				if(res.statusCode >= 500 || err || res.err) {
					return 'error'
				}

				if(res.statusCode >= 400) {
					if(res.statusCode === 404) {
						return 'trace'
					}

					return 'warn'
				}

				if(isModifyingRequest(req)) {
					return 'info'
				}

				return 'debug'
			},
			quietResLogger: true,
			quietReqLogger: true,
			autoLogging: true,
		}),
	)

	// Static assets. The cache policy is the whole point here: express.static
	// defaults to `max-age=0`, which makes the browser send a conditional
	// request for EVERY asset on EVERY navigation — ~24 round trips returning
	// 304 with no payload, that is, a few hundred ms of blank page per page view
	// once there is real network latency (invisible on localhost, obvious in
	// production).
	//
	// Everything under `dist/` is content-hashed by Vite, so it can be cached
	// forever: a deploy changes the filename, never the contents of a URL.
	// The rest (favicons, logos, the raw `styles/` sources) keeps a short TTL —
	// those URLs are stable, so they must stay revalidatable.
	app.use('/public', express.static(join(import.meta.dirname, '../public'), {
		maxAge: '1h',
		setHeaders(res, path) {
			if(path.includes(`${sep}dist${sep}`)) {
				res.setHeader(
					'Cache-Control', 'public, max-age=31536000, immutable',
				)
			}
		},
	}))

	// Default for everything that is NOT a static asset. Pages embed the hashed
	// asset URLs from the mount above, so a page body reused from a cache after a
	// deploy would reference filenames that no longer exist. `no-cache` does not
	// forbid caching — it forbids reuse WITHOUT revalidating, so the ETag still
	// answers 304 with no body. Routes that genuinely want to be cached (OG
	// images, sitemap, robots) set their own header, which overrides this.
	app.use((_req, res, next) => {
		res.setHeader('Cache-Control', 'no-cache')
		next()
	})

	let vite: ViteDevServer | undefined
	if(!IS_PRODUCTION) {
		const {
			createServer: createViteServer,
			searchForWorkspaceRoot,
		} = await import('vite')
		vite = await createViteServer({
			root: join(import.meta.dirname, '..'),
			base: BASE_PATH,
			server: {
				middlewareMode: true,
				hmr: { server },
				fs: {
					allow: [
						searchForWorkspaceRoot(import.meta.dirname),
					],
				},
			},
			appType: 'custom',
			clearScreen: false,
			plugins: [HTMX_MONKEY_PATCH],
		})

		// `openapi.yaml` sits at the Vite root; claim the path before Vite's
		// static-file middleware so it is served only by an explicit route.
		app.use((req, res, next) => {
			if(req.path === `${BASE_PATH}openapi.yaml`) {
				next()
				return
			}

			vite!.middlewares(req, res, next)
		})
		app.use((req, res, next) => ((req.vite = vite), next()))
	}

	// set up OpenAPI validator middleware
	// with our spec and handlers
	app.use(
		middleware({
			apiSpec: SPEC_PATH,
			validateApiSpec: true,
			validateRequests: {
				coerceTypes: true,
				removeAdditional: true,
				// With `removeAdditional`, a plain `oneOf` strips one branch's
				// properties while it tries another. `discriminator` checks only the
				// branch that `propertyName` selects.
				discriminator: true,
			},
			validateSecurity: false,
			ignoreUndocumented: true,
			validateFormats: true,
			fileUploader: {
				storage: multer.memoryStorage(),
				limits: { fileSize: 4 * 1024 * 1024 },
			},
			formats: {
				base64: {
					type: 'string',
					validate(str: string) {
						try {
							Buffer.from(str, 'base64')
							return true
						} catch{
							return false
						}
					},
				},
			},
			validateResponses: false,
			operationHandlers: {
				basePath: '',
				resolver: async(path, { openApiRoute, basePath, method }, apiDoc) => {
					const pathKey = openApiRoute.substring(basePath.length)
					const pathObj =
						apiDoc.paths?.[pathKey]?.[method.toLowerCase() as 'post']
					assert(
						pathObj,
						'Cannot find path in OpenAPI spec' + ` for ${method} ${pathKey}`,
					)

					const moduleName =
						'x-eov-operation-handler' in pathObj &&
						typeof pathObj['x-eov-operation-handler'] === 'string'
							? pathObj['x-eov-operation-handler']
							: pathObj.operationId
					assert(moduleName, `Missing operationId for ${method} ${pathKey}`)

					const modulePath = findModule('./routes/' + moduleName)
					if(!modulePath) {
						return () => {
							throw notImplemented('Handler not implemented')
						}
					}

					return getPageMiddleware(modulePath)
				},
			},
		}),
	)
	app.use((req, _, next) => {
		// set operation name
		if(req.openapi?.schema?.operationId) {
			req.operationName = req.openapi.schema.operationId
		}

		next()
	})

	app.get('/{*four_o_four}', async(req, res, next) => {
		if(!shouldReturnHtml(req)) {
			next()
			return
		}

		const errorPagePath = findModule('routes/ErrorPage')
		assert(errorPagePath, 'ErrorPage module not found')
		const errorPage = await loadDefaultModule<typeof ErrorPage>(
			req,
			errorPagePath,
		)
		const html = errorPage({
			err: notFound('Looks like you strayed too far'),
		})
		res.status(404).set({ 'Content-Type': 'text/html' }).end(html)
	})

	// Final error middleware: JSON callers (SDK + 404 fallthrough) receive
	// RFC 9457 problem documents. HTML callers' errors are already mapped
	// inside getPageMiddleware.
	app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
		if(res.headersSent) {
			next(err)
			return
		}

		const mapped = mapError(err)
		// attach for the pino log serializer
		res.err = mapped
		res
			.status(mapped.output.statusCode)
			.set(mapped.output.headers)
			.set('Content-Type', 'application/problem+json')
			.json({
				type: 'about:blank',
				title: mapped.output.payload.error || 'Error',
				status: mapped.output.statusCode,
				detail: mapped.message,
				instance: req.requestId,
			})
	})

	app.destroy = async() => {
		await vite?.close()
		await new Promise<void>((resolve, reject) => {
			server.close((err) => (!err ? resolve() : reject(err)))
		})
		LOGGER.info('closed server')
		server.closeIdleConnections()
		if(server.connections) {
			await setTimeout(GRACEFUL_SHUTDOWN_TIMEOUT_MS)
			server.closeAllConnections()
		}
	}

	// Route Express's app.listen through the underlying http.Server so the
	// shared server (used for graceful shutdown) is the one bound. Neither the
	// reassignment nor the spread into server.listen matches Express's
	// overloaded listen signature, but both are correct at runtime.
	// @ts-expect-error — overriding the overloaded app.listen signature
	app.listen = (...args) => {
		// @ts-expect-error — spread args into the overloaded server.listen
		server.listen(...args)
		return server
	}

	return app
}

function getPageMiddleware(modulePath: string): RequestHandler {
	return async(req, res, next) => {
		try {
			const securities = req.openapi?.schema?.security || []
			const isAnonymousAllowed = securities.some(
				(s) => Object.keys(s).length === 0,
			)
			// This gate only enforces the session (`BearerAuth`, which the cookie
			// also satisfies). We only force a session when EVERY security
			// alternative requires `BearerAuth`; if any alternative is satisfiable
			// without it, the handler decides which scheme authenticated.
			const requiresBearer =
				securities.length > 0 && securities.every((s) => 'BearerAuth' in s)

			if(requiresBearer && !isAnonymousAllowed) {
				// Require auth if there's no {} in the security array
				const customMessage = req.openapi?.schema?.['x-auth-message']
				requireAuth(req, customMessage)
			}

			const fn =
				OVERRIDE_HANDLERS[req.openapi?.schema?.operationId!] ||
				(await loadDefaultModule<RequestHandler>(req, modulePath))
			const html = await fn(req, res, next)
			// assume that if the handler returns no html,
			// it has handled the response itself
			// (for example, via res.json or res.send)
			if(typeof html === 'undefined') {
				return
			}

			res.status(200).set({ 'Content-Type': 'text/html' }).end(html)
		} catch(err) {
			// A full-page HTML request gets the rendered ErrorPage; EVERY htmx
			// request — fragment swap, form post, or nav shell swap — rethrows to
			// the problem+json handler instead. That is deliberate, not an
			// oversight: `HxForm` funnels 4xx/409/422 bodies into `.form-error`, and
			// `client/index.ts` parses the body as JSON to build its toast, so both
			// need a problem document rather than a whole error page. htmx does not
			// swap error responses by default either, so a failed nav swap leaves
			// the current page up and surfaces the detail as a toast.
			if(!shouldReturnHtml(req) || req.headers['hx-request']) {
				throw err
			}

			// @ts-expect-error — stash the original error on res for the
			// downstream logger/finalizer (not a standard Express field)
			res.err = err

			const mappedErr = mapError(err)
			const errorPagePath = findModule('routes/ErrorPage')
			assert(errorPagePath, 'ErrorPage module not found')
			const errorPage = await loadDefaultModule<typeof ErrorPage>(
				req,
				errorPagePath,
			)
			const html = errorPage({ err: mappedErr })
			res
				.status(mappedErr.output.statusCode)
				.set({ ...mappedErr.output.headers, 'Content-Type': 'text/html' })
				.end(html)
		}
	}
}

function shouldReturnHtml(req: Request) {
	if(
		// either explict html or no defined
		// accept
		req.headers.accept?.includes('html') ||
		req.headers['accept'] === '*/*'
	) {
		return true
	}

	if(req.headers['hx-request']) {
		return true
	}
}

async function loadDefaultModule<T>(req: Request, path: string) {
	let fn: T
	if(!req.vite) {
		const { default: render } = await import(path)
		fn = render
	} else {
		const { default: render } = await req.vite.ssrLoadModule(path)
		fn = render
	}

	return fn
}

/**
 * Find a module relative to the current dir
 */
function findModule(relPath: string) {
	for(const ext of MOD_EXTS) {
		const modulePath = join(import.meta.dirname, relPath + ext)
		if(existsSync(modulePath)) {
			return modulePath
		}
	}
}

// running htmx ESM in happy-dom has a bug where it isn't able
// to enclose the htmx export correctlty, which causes it to throw an error
// when we try to import it in our client code. So, this monkey patch
// fixes that
const HTMX_MONKEY_PATCH: PluginOption = {
	name: 'htmx-fix',
	enforce: 'pre',
	transform(code, id, opts) {
		if(opts?.ssr) {
			return
		}

		if(!id.includes('htmx__org.js')) {
			return
		}

		return {
			code: code
				.replace('var htmx = ', 'export default ')
				.replace('export { htmx as default }', ''),
		}
	},
}

// we use qs to parse query strings instead of the
// default query parser in express, because it allows for
// parsing nested objects and arrays in query strings, which is
// useful for handling complex query parameters in our API.
function parseQuery(str: string) {
	try {
		const query = parse(str, { arrayLimit: 100 })
		// Live-search forms submit every field, filled or not, and the validator
		// rejects `?q=` where it accepts a missing `q`. Treat blank as missing.
		for(const [key, value] of Object.entries(query)) {
			if(typeof value === 'string' && !value.trim()) {
				delete query[key]
			}
		}

		return query
	} catch(err) {
		throw badRequest(`Invalid query string (${err})`)
	}
}

function isModifyingRequest(req: Request) {
	return (
		req.method === 'POST' ||
		req.method === 'PATCH' ||
		req.method === 'PUT' ||
		req.method === 'DELETE'
	)
}
