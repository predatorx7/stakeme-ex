/**
 * Inline error sink for HTMX forms. The response-targets extension
 * paints 4xx response bodies (RFC 9457 problem documents) into this
 * element. The form clears it on the next non-error response.
 */
export function FormError() {
	return (
		<output
			class='form-error'
			role='alert' />
	)
}
