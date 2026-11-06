import type { PricePoint } from '../../types/index.ts'
import { sparklineArea, sparklinePath } from './sparkline-path.ts'

const W = 100
const H = 28

/**
 * Tiny server-rendered trend line (80x24 via CSS). Mint when the series ends
 * at or above its start, red below. Decorative: keep the change text visible.
 * The line is the first path; the live watchlist client rewrites only that.
 */
export function Sparkline({ points, area }: {
	points: PricePoint[]
	name?: string
	area?: boolean
}) {
	if(points.length < 2) {
		return <span class='smx-spark' />
	}

	const values = points.map((p) => Number(p.price))
	return (
		<svg
			class='smx-spark'
			data-dir={values[values.length - 1] >= values[0] ? 'up' : 'down'}
			viewBox={`0 0 ${W} ${H}`}
			preserveAspectRatio='none'
			aria-hidden='true'
			focusable='false'>
			<path d={sparklinePath(values, W, H)} />
			{
				area && (
					<path
						class='smx-spark__area'
						d={sparklineArea(values, W, H)} />
				)
			}
		</svg>
	)
}
