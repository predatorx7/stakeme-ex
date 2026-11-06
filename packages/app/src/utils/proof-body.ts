/**
 * Reclaim posts the proof as `application/x-www-form-urlencoded` where the
 * whole JSON document is the key of a single, empty field. Unwrap that so
 * `verifyIncomeProof` always sees the proof object; JSON bodies pass through.
 */
export function unwrapProofBody(body: unknown): unknown {
	if(!body || typeof body !== 'object') {
		return body
	}

	const keys = Object.keys(body)
	if(keys.length === 1 && keys[0].startsWith('{')) {
		try {
			return JSON.parse(keys[0])
		} catch{
			return body
		}
	}

	return body
}
