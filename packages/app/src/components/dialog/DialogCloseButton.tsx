import { Icon } from '../Icon.tsx'

/** The × in a dialog header. The native `command='close'` invoker closes it
 *  without JavaScript. */
export function DialogCloseButton({ dialogId }: { dialogId: string }) {
	return (
		<button
			type='button'
			class='rc-dialog__close'
			command='close'
			commandfor={dialogId}
			aria-label='Close dialog'>
			<Icon name='close' />
		</button>
	)
}
