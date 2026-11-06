import { createHash } from 'node:crypto'

/** Gravatar's generated (non-photo) default images. */
export const GRAVATAR_STYLES = [
	'identicon',
	'monsterid',
	'wavatar',
	'retro',
	'robohash',
] as const

/**
 * Deterministic generated avatar for a wallet address (or any stable id).
 * The style is picked from the first byte of the hash, so each seed always
 * gets the same image but different seeds look varied. `f=y` forces the
 * generated image, never a real Gravatar photo. `size` is in CSS px; the
 * image is requested at 2x for sharp rendering on dense screens.
 *
 * Privacy: the browser fetches this URL from gravatar.com, which only ever
 * sees the SHA-256 of the seed, never the address itself.
 */
export function gravatarUrl(seed: string, size = 80) {
	const hash = createHash('sha256')
		.update(seed.trim().toLowerCase())
		.digest()
	const style = GRAVATAR_STYLES[hash[0] % GRAVATAR_STYLES.length]
	return `https://gravatar.com/avatar/${hash.toString('hex')}`
		+ `?d=${style}&f=y&s=${Math.round(size * 2)}&r=g`
}
