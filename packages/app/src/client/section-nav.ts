/// <reference lib="dom" />

/** Marks the `.smx-section-nav` link of the section in view. */
let queued = false
function update() {
	queued = false
	const links = document.querySelectorAll<HTMLAnchorElement>(
		'.smx-section-nav a',
	)
	let current: HTMLAnchorElement | undefined
	for(const link of links) {
		const target = document.getElementById(link.hash.slice(1))
		if(target && target.getBoundingClientRect().top <= 140) {
			current = link
		}
	}

	for(const link of links) {
		if(link === current) {
			link.setAttribute('aria-current', 'true')
		} else {
			link.removeAttribute('aria-current')
		}
	}
}

addEventListener('scroll', () => {
	if(!queued) {
		queued = true
		requestAnimationFrame(update)
	}
}, { passive: true })
addEventListener('DOMContentLoaded', update)
