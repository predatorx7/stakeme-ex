/**
 * Narrows a JSONB column to the OpenAPI schema its SQL builder produces.
 * PGTyped types every `jsonb` as `unknown`; the `<entity>_json` functions in
 * ddl.sql are written to match `openapi.yaml`, which is why this one cast is
 * safe. Only for the HTML path, where the page reads fields; JSON responses
 * pass `row.j` straight to `res.json`.
 */
export function typed<T>(j: unknown): T {
	return j as T
}
