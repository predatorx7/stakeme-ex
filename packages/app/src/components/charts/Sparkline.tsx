import type { PricePoint } from '../../types/index.ts'

/** Normalized line coordinates for a price series in a 100x28 box. */
export function sparkPath(points: PricePoint[]) {
	const values = points.map((p) => Number(p.price))
	const min = Math.min(...values)
	const span = Math.max(...values) - min || 1
	return values
		.map((v, i) => {
			const x = values.length > 1 ? i / (values.length - 1) * 100 : 50
			const y = 26 - (v - min) / span * 24
			return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`
		})
		.join(' ')
}

/** A tiny trend line for a table row. Green when the series ends higher. */
export function Sparkline({ points, name }: {
	points: PricePoint[]
	name: string
}) {
	if(points.length < 2) {
		return <span class='smx-spark' />
	}

	const first = Number(points[0].price)
	const last = Number(points[points.length - 1].price)
	return (
		<svg
			class='smx-spark'
			data-dir={last >= first ? 'up' : 'down'}
			viewBox='0 0 100 28'
			preserveAspectRatio='none'
			role='img'
			aria-label={`${name} price trend`}>
			<path d={sparkPath(points)} />
		</svg>
	)
}
