import { icons, type ReclaimIconName } from '@reclaimprotocol/design/icons'

export type IconName = ReclaimIconName

/** An inline SVG from the design package; it inherits the text color. */
export function Icon({ name, class: className }: {
	name: IconName
	class?: string
}) {
	return className
		? icons[name].replace('<svg ', `<svg class="${className}" `)
		: icons[name]
}
