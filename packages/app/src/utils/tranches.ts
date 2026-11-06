/** True when the creator chose no tranches (all paid at raise close). */
export function isSingleTranche(tranches: readonly unknown[]) {
	return tranches.length === 1
}

/** Investor-facing label for a single-tranche creator. */
export const SINGLE_TRANCHE_LABEL
	= 'All released at raise close (no escrow milestones)'

/** Short pill text for the same. */
export const SINGLE_TRANCHE_BADGE = 'No escrow milestones'
