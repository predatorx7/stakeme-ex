import { escapeText } from '../utils/escape.ts'

const TIP = 'Shared team balance of prepaid 0G Private Computer credits '
	+ 'used by the AI audit; not a per-user balance'

type Balance = { configured: boolean, creditUsd?: string }

/**
 * The team's 0G Router credit (one shared account, not per user) that pays
 * for the AI audit. It refreshes itself every 30 s and shortly after each
 * oracle event, so the demo shows the balance going down. Pass `balance` to
 * render a value; without it the readout loads
 * from `GET /api/zero-g/balance` (an `outerHTML` swap keeps it polling).
 */
export function ZeroGBalance({ balance }: { balance?: Balance }) {
	let label = 'Team 0G credits: loading'
	if(balance) {
		label = balance.configured && balance.creditUsd
			? `Team 0G credits: $${balance.creditUsd}`
			: 'Team 0G credits: not configured'
	}

	return (
		<span
			id='zg-balance'
			class='rc-pill'
			data-tone='sandbox'
			title={TIP}
			hx-get='/api/zero-g/balance'
			hx-trigger='load, every 30s, smx:oracle-event from:body delay:4s'
			hx-swap='outerHTML'>
			{escapeText(label)}
		</span>
	)
}
