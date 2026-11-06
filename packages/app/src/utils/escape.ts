import { type Children, contentsToString, escapeHtml } from '@kitajs/html'

/**
 * Escapes text for use as a JSX child. Unlike `escapeHtml` it only accepts
 * text and numbers, so a `Children` value (already rendered markup) is a type
 * error instead of being escaped twice. The `escape` prefix is what the
 * KitaJS XSS scanner (`xss-scan`) recognizes.
 */
export function escapeText(value: string | number | bigint | null | undefined) {
	return escapeHtml(value ?? '')
}

/**
 * Passes already-rendered markup (JSX, or a `Children` prop) through
 * untouched. Use it for props that hold JSX: the scanner can't tell a
 * narrowed `Children` value from an unescaped string, but accepts a call that
 * returns `JSX.Element`. Never pass user-controlled text here.
 */
export function markup(value: Children): JSX.Element {
	return contentsToString([value])
}

/**
 * Emits HTML verbatim. Only for HTML this app generated or sanitized itself;
 * every call site states why it is safe. Never pass user-controlled text here.
 */
export function trustedHtml(html: string): JSX.Element {
	return contentsToString([html])
}

/**
 * JSON for an inline `<script>`. `JSON.stringify` leaves `<`, `>` and `&`
 * as they are, so a value containing `</script>` would end the script and
 * start markup. Escaping them as `\uXXXX` keeps the JSON identical once parsed.
 */
export function jsonForScript(value: unknown) {
	return JSON.stringify(value)
		.replace(/</g, '\\u003c')
		.replace(/>/g, '\\u003e')
		.replace(/&/g, '\\u0026')
		.replace(/\u2028/g, '\\u2028')
		.replace(/\u2029/g, '\\u2029')
}
