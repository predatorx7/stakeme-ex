/** `1 provider`, `2 providers`. */
export function plural(count: number, noun: string) {
	return `${count} ${noun}${count === 1 ? '' : 's'}`
}
