import { escapeText } from '../utils/escape.ts'

/** 24h change in percent: green up, red down, with a sign for color-blind
 *  readers. */
export function PriceChange({ value }: { value: number }) {
	const dir = value > 0 ? 'up' : value < 0 ? 'down' : 'flat'
	const sign = value > 0 ? '+' : ''
	return (
		<span
			class='smx-change'
			data-dir={dir}>
			{escapeText(`${sign}${value.toFixed(2)}%`)}
		</span>
	)
}
