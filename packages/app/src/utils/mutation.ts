import type { Request, Response } from 'express'
import { sendOrRedirect } from './http.ts'

/**
 * Responds to a mutation from either surface. htmx callers get `204` plus
 * `HX-Redirect` (when `redirect` is set) and an `HX-Trigger` event the page
 * can react to; JSON callers get `201` and the created resource. The final
 * state is already committed, so both return immediately (optimistic UI).
 */
export function respondMutation(
	req: Pick<Request, 'headers'>,
	res: Response,
	opts: {
		body: unknown
		/** Where an htmx caller goes next. */
		redirect?: string
		/** htmx event name fired on the client, with the resource as detail. */
		trigger?: string
		/** `Location` of the new resource for JSON callers. */
		location?: string
	},
) {
	if(req.headers['hx-request']) {
		if(opts.trigger) {
			res.setHeader('HX-Trigger', JSON.stringify({ [opts.trigger]: opts.body }))
		}

		if(opts.redirect) {
			sendOrRedirect(req, res, opts.redirect)
			return
		}

		res.status(204).end()
		return
	}

	if(opts.location) {
		res.setHeader('Location', opts.location)
	}

	res.status(201).json(opts.body)
}
