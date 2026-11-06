/// <reference lib="dom" />

/**
 * Export of a locally stored private key (generated or imported wallet).
 * Delegated, no framework.
 *
 *   [data-key-export="evm|hedera"]  click: open `#key-export-dialog`.
 *   [data-key-reveal]               in the dialog: show the key (explicit).
 *   [data-key-value]                receives the key; the design system's
 *                                   copy button reads its text.
 *
 * The key is only put in the DOM on reveal and removed when the dialog closes.
 * Contract: docs/frontend-hooks.md.
 */

/** localStorage keys of the local wallets. */
export const EVM_KEY_STORAGE = 'smx.burnerKey'
export const HEDERA_KEY_STORAGE = 'smx.hedera.burner'

const STORAGE_BY_KIND = {
	evm: EVM_KEY_STORAGE,
	hedera: HEDERA_KEY_STORAGE,
} as const

const DIALOG_ID = 'key-export-dialog'

let storageKey: string | undefined

document.addEventListener('click', (event) => {
	const target = event.target as Element | null
	const trigger = target?.closest<HTMLElement>('[data-key-export]')
	if(trigger) {
		event.preventDefault()
		const kind = trigger.dataset.keyExport
		if(kind === 'evm' || kind === 'hedera') {
			open(STORAGE_BY_KIND[kind], kind)
		}

		return
	}

	if(target?.closest('[data-key-reveal]')) {
		event.preventDefault()
		reveal()
	}
})

// `close` does not bubble: capture it. Drop the key from the DOM.
document.addEventListener('close', (event) => {
	if((event.target as Element | null)?.id === DIALOG_ID) {
		storageKey = undefined
		reset()
	}
}, true)

function dialog() {
	return document.querySelector<HTMLDialogElement>(`#${DIALOG_ID}`)
}

function open(key: string, kind: string) {
	const dlg = dialog()
	if(!dlg) {
		return
	}

	// Another dialog (the Hedera signer choice) may be showing: don't stack.
	for(const other of document.querySelectorAll<HTMLDialogElement>(
		'dialog[open]',
	)) {
		other.close()
	}

	storageKey = key
	reset()
	const title = dlg.querySelector('h2')
	if(title) {
		title.textContent = kind === 'hedera' ? 'Export Hedera key' : 'Export key'
	}

	dlg.showModal()
}

function reveal() {
	const dlg = dialog()
	const out = dlg?.querySelector<HTMLElement>('[data-key-value]')
	let key: string | null = null
	try {
		key = storageKey ? localStorage.getItem(storageKey) : null
	} catch{}

	if(!dlg || !out) {
		return
	}

	out.textContent = key || 'No key is stored in this browser.'
	out.hidden = false
	const copy = dlg.querySelector<HTMLButtonElement>('[data-copy]')
	if(copy) {
		copy.disabled = !key
	}

	dlg.querySelector<HTMLElement>('[data-key-reveal]')?.setAttribute(
		'hidden',
		'',
	)
}

function reset() {
	const dlg = dialog()
	const out = dlg?.querySelector<HTMLElement>('[data-key-value]')
	if(out) {
		out.textContent = ''
		out.hidden = true
	}

	const copy = dlg?.querySelector<HTMLButtonElement>('[data-copy]')
	if(copy) {
		copy.disabled = true
	}

	dlg?.querySelector<HTMLElement>('[data-key-reveal]')?.removeAttribute(
		'hidden',
	)
}
