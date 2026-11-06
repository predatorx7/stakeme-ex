import {
	contentToString,
	escapeHtml,
	type PropsWithChildren,
} from '@kitajs/html'
import { Icon } from './Icon.tsx'

/**
 * The ⋮ overflow menu: a native popover that holds secondary actions so a
 * toolbar shows one primary button. The browser handles light dismiss and
 * Escape, and the menu anchors to its trigger.
 *
 * Children are the menu items, each with `role='menuitem'`: buttons or links,
 * including htmx buttons and `command`/`commandfor` dialog triggers. Renders
 * nothing when no child survives its condition.
 */
export function ActionMenu(props: PropsWithChildren<{
	/** Unique on the page; ties the trigger to its popover. */
	id: string
	/** Accessible name of the trigger, for example "Provider actions". */
	label: string
	/** Text for the trigger, in place of the ⋮ icon, for example "Manage". */
	text?: string
	/** Show the ⋮ icon beside `text` instead of replacing it. */
	withIcon?: boolean
	/** `primary` styles the trigger as the page's primary button, for a page
	 *  whose main actions all live in this menu. */
	variant?: 'primary'
	/** `corner` pins the trigger to the top-right of the nearest positioned
	 *  ancestor, such as a card. */
	position?: 'corner'
}>) {
	// Render up front: `false`, `null`, and `''` all render nothing, which is
	// the only reliable way to tell whether any action is visible.
	const items = contentToString(props.children)
	if(typeof items === 'string' && !items) {
		return null
	}

	return (
		<div
			class='action-menu'
			data-position={props.position}>
			<button
				type='button'
				class='rc-button'
				data-size='md'
				data-icon-only={props.text ? undefined : ''}
				data-variant={props.variant}
				popovertarget={props.id}
				title={escapeHtml(props.label)}
				aria-label={escapeHtml(props.label)}
				aria-haspopup='menu'>
				{
					props.text
						? (
							<>
								{props.withIcon && <Icon name='more' />}
								{escapeHtml(props.text)}
							</>
						)
						: <Icon name='more' />
				}
			</button>
			<div
				id={props.id}
				class='rc-dropdown__menu'
				role='menu'
				popover>
				{items}
			</div>
		</div>
	)
}
