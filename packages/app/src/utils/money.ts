/** Formats a USDC amount (decimal string or number) for display, trimming
 *  trailing zeros beyond two decimals: `1250.500000` becomes `$1,250.50`. */
export function formatUsdc(amount: string | number, maxDigits = 2) {
	return Number(amount).toLocaleString('en-US', {
		style: 'currency',
		currency: 'USD',
		minimumFractionDigits: 2,
		maximumFractionDigits: maxDigits,
	})
}

/** Formats a creator-token amount with thousands separators. */
export function formatTokens(amount: string | number, maxDigits = 2) {
	return Number(amount).toLocaleString('en-US', {
		maximumFractionDigits: maxDigits,
	})
}

/** Shortens an address or hash for display: `0x1234…abcd`. */
export function shortHex(value: string, head = 6, tail = 4) {
	return value.length <= head + tail + 1
		? value
		: `${value.slice(0, head)}…${value.slice(-tail)}`
}
