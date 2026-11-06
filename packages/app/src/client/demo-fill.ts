/**
 * Pure helpers for the demo bar's prefill buttons. No DOM globals, so node
 * tests run them on plain objects. `demo.ts` adapts real form elements.
 */

/** The slice of an input, select or textarea that prefill touches. */
export type FieldLike = {
	name: string
	type: string
	value: string
	checked?: boolean
	disabled?: boolean
}

export type PrefillValue = string | number | boolean
export type Prefill = { form: string, values: Record<string, PrefillValue> }

const SKIPPED_TYPES = new Set(['hidden', 'file', 'submit', 'button', 'reset'])

/**
 * Sets each field named in `values`. Radios check the one whose value matches;
 * a checkbox follows a boolean (or matches its own value); everything else
 * takes the string. Skips disabled and non-text types. Returns only the fields
 * that changed, so the caller dispatches events for those.
 */
export function fillFields(
	fields: readonly FieldLike[],
	values: Readonly<Record<string, PrefillValue>>,
) {
	const changed: FieldLike[] = []
	for(const field of fields) {
		if(
			!field.name
			|| field.disabled
			|| SKIPPED_TYPES.has(field.type)
			|| !Object.hasOwn(values, field.name)
		) {
			continue
		}

		const want = values[field.name]
		if(field.type === 'radio') {
			const checked = String(want) === field.value
			if(checked && !field.checked) {
				field.checked = true
				changed.push(field)
			}

			continue
		}

		if(field.type === 'checkbox') {
			const checked = typeof want === 'boolean'
				? want
				: want === 'true' || String(want) === field.value
			if(checked !== !!field.checked) {
				field.checked = checked
				changed.push(field)
			}

			continue
		}

		const text = String(want)
		if(field.value !== text) {
			field.value = text
			changed.push(field)
		}
	}

	return changed
}

/** Parses a `data-demo-prefill` attribute. Returns `null` when malformed. */
export function parsePrefill(raw: string | null | undefined): Prefill | null {
	if(!raw) {
		return null
	}

	let data: unknown
	try {
		data = JSON.parse(raw)
	} catch{
		return null
	}

	if(!data || typeof data !== 'object') {
		return null
	}

	const { form, values } = data as Record<string, unknown>
	if(
		typeof form !== 'string'
		|| !form
		|| !values
		|| typeof values !== 'object'
	) {
		return null
	}

	const clean: Record<string, PrefillValue> = {}
	for(const [key, value] of Object.entries(values)) {
		if(
			typeof value === 'string'
			|| typeof value === 'number'
			|| typeof value === 'boolean'
		) {
			clean[key] = value
		}
	}

	return { form, values: clean }
}

/** Maps a path to the demo step it belongs to, or `null` when none does. */
export function stepForPath(path: string) {
	const p = path.replace(/\/+$/, '').toLowerCase() || '/'
	if(p === '/launch') {
		return 1
	}

	if(p === '/hub') {
		return 2
	}

	if(p === '/portfolio' || p.startsWith('/creators/mush')) {
		return 4
	}

	return null
}

/** Only same-site paths and http(s) URLs may become links or redirects. */
export function safeUrl(url: unknown) {
	if(typeof url !== 'string' || !url) {
		return null
	}

	if(url.startsWith('/') && !url.startsWith('//')) {
		return url
	}

	return /^https?:\/\//i.test(url) ? url : null
}
