const PAD = 2

/**
 * Polyline path for a series in a w x h box, y inverted, 2px vertical pad.
 * Empty gives ''. One point or a flat series gives a mid-height line.
 */
export function sparklinePath(points: number[], w: number, h: number) {
	if(!points.length) {
		return ''
	}

	const min = Math.min(...points)
	const span = Math.max(...points) - min
	const coord = (v: number, i: number) => {
		const x = points.length > 1 ? i / (points.length - 1) * w : 0
		const y = span ? h - PAD - (v - min) / span * (h - 2 * PAD) : h / 2
		return `${x.toFixed(1)} ${y.toFixed(1)}`
	}

	const path = points.map((v, i) => `${i ? 'L' : 'M'}${coord(v, i)}`)
	if(points.length === 1) {
		path.push(`L${w} ${(h / 2).toFixed(1)}`)
	}

	return path.join(' ')
}

/** Closed path under the line, for the faint area fill. */
export function sparklineArea(points: number[], w: number, h: number) {
	const line = sparklinePath(points, w, h)
	return line && `${line} L${w} ${h} L0 ${h} Z`
}
