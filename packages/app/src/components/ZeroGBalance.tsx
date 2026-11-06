import { escapeText } from '../utils/escape.ts'

type Balance = { configured: boolean, creditUsd?: string }

/**
 * The 0G Router credit that pays for the AI audit. It refreshes itself every
 * 30 s and shortly after each oracle event, so the demo shows the balance
 * going down. Pass `balance` to render a value; without it the readout loads
 * from `GET /api/zero-g/balance` (an `outerHTML` swap keeps it polling).
 */
export function ZeroGBalance({ balance }: { balance?: Balance }) {
	let label = '0G credit: loading'
	if(balance) {
		label = balance.configured && balance.creditUsd
			? `0G credit: $${balance.creditUsd}`
			: '0G credit: not configured'
	}

	return (
		<span
			id='zg-balance'
			class='rc-pill'
			data-tone='sandbox'
			title='Prepaid 0G Private Computer credit used by the AI audit'
			hx-get='/api/zero-g/balance'
			hx-trigger='load, every 30s, smx:oracle-event from:body delay:4s'
			hx-swap='outerHTML'>
			{escapeText(label)}
		</span>
	)
}
