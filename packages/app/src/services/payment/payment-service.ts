import { Boom } from '@hapi/boom'
import { parseUnits } from 'viem'
import type {
	DividendSplit,
	DividendStreamResult,
} from '../../integrations/types.ts'
import { keccakUtf8 } from '../../integrations/util.ts'
import { LOGGER } from '../../logger.ts'

/** A dividend to pay. `splits` come from SQL (`pro_rata_split`). */
export type PayableDividend = {
	id: string
	creatorId: string
	ticker: string
	/** Decimal USDC string. */
	amountDue: string
	splits: DividendSplit[]
}

export type PayoutContext = {
	dividendId: string
	creatorId: string
	ticker: string
}

/**
 * One way to move a dividend to holders. `payout` pays from the platform;
 * `createPaymentRequest` and `settle` are the optional signed-payment loop
 * (x402): the rail describes what the creator must sign, the browser signs,
 * and the rail settles it.
 */
export interface IPaymentRail {
	readonly name: string
	payout(
		splits: DividendSplit[],
		ctx: PayoutContext,
	): Promise<DividendStreamResult>
	createPaymentRequest?(
		dividend: PayableDividend,
		splits: DividendSplit[],
	): Promise<unknown>
	settle?(
		dividend: PayableDividend,
		paymentPayload: unknown,
	): Promise<DividendStreamResult>
}

/** Stores the receipts of a paid dividend (SQL `stream_receipts`). */
export type ReceiptRecorder = (
	dividendId: string,
	result: DividendStreamResult,
) => Promise<void>

/**
 * Pays dividends over a rail and records the receipts. It never computes
 * amounts: the splits arrive from SQL and are only checked to add up.
 */
export class PaymentService {

	readonly #rail: IPaymentRail
	readonly #record: ReceiptRecorder

	constructor(rail: IPaymentRail, record: ReceiptRecorder = async() => {}) {
		this.#rail = rail
		this.#record = record
	}

	get railName() {
		return this.#rail.name
	}

	/** Pays every holder from the platform and records the receipts. */
	async payDividend(dividend: PayableDividend) {
		assertSplitsAdd(dividend)
		const result = await this.#rail.payout(dividend.splits, {
			dividendId: dividend.id,
			creatorId: dividend.creatorId,
			ticker: dividend.ticker,
		})
		await this.#record(dividend.id, result)
		return result
	}

	/** The signed-payment requirements for the creator's wallet (x402). */
	async createPaymentRequest(dividend: PayableDividend) {
		assertSplitsAdd(dividend)
		if(!this.#rail.createPaymentRequest) {
			throw new Boom('This payment rail has no signed payments', {
				statusCode: 501,
			})
		}

		return this.#rail.createPaymentRequest(dividend, dividend.splits)
	}

	/** Settles the signed payment from the browser and records receipts. */
	async settle(dividend: PayableDividend, paymentPayload: unknown) {
		assertSplitsAdd(dividend)
		if(!this.#rail.settle) {
			throw new Boom('This payment rail has no signed payments', {
				statusCode: 501,
			})
		}

		const result = await this.#rail.settle(dividend, paymentPayload)
		await this.#record(dividend.id, result)
		return result
	}

}

/** Default rail: deterministic `sim:` receipts, no network. */
export class SimulatedPaymentRail implements IPaymentRail {

	readonly name = 'simulated'

	async payout(splits: DividendSplit[], ctx: PayoutContext) {
		LOGGER.warn({ dividendId: ctx.dividendId }, 'simulated dividend payout')
		return simulatePayout(ctx.dividendId, splits)
	}

	async createPaymentRequest(
		dividend: PayableDividend,
		splits: DividendSplit[],
	) {
		return {
			scheme: 'simulated',
			dividendId: dividend.id,
			amount: dividend.amountDue,
			payTo: splits.map((s) => ({ wallet: s.wallet, amount: s.amount })),
		}
	}

	async settle(dividend: PayableDividend) {
		return simulatePayout(dividend.id, dividend.splits)
	}

}

/** Pure: deterministic fake receipts, one per split. */
export function simulatePayout(
	dividendId: string,
	splits: DividendSplit[],
): DividendStreamResult {
	return {
		status: 'SIMULATED',
		receipts: splits.map(
			(s) => `sim:${keccakUtf8(`${dividendId}:${s.wallet}:${s.amount}`)}`,
		),
	}
}

function assertSplitsAdd(dividend: PayableDividend) {
	const sum = dividend.splits
		.reduce((acc, s) => acc + parseUnits(s.amount, 6), 0n)
	if(!dividend.splits.length || sum !== parseUnits(dividend.amountDue, 6)) {
		throw new Boom('Dividend splits do not add up to the amount due', {
			statusCode: 500,
		})
	}
}
