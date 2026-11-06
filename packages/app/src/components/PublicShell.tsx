import type { PropsWithChildren } from '@kitajs/html'

/** Runs before first paint, so a dark theme never flashes light. The theme
 *  behavior takes over once the client bundle loads. */
export const THEME_INIT = `{
const root = document.currentScript.parentElement
let theme
try { theme = localStorage.getItem('reclaim-theme') } catch {}
root.dataset.theme = theme || (
	matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
)
}`

/** Themed, textured surface for every page. */
export function PublicShell({ children }: PropsWithChildren) {
	return (
		<div
			class='rc-surface public-shell'
			data-theme-root>
			<script>
				{THEME_INIT}
			</script>
			<div
				data-reclaim-guilloche
				aria-hidden='true' />
			{children}
		</div>
	)
}
