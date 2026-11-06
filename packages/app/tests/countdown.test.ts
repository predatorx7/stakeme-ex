import assert from 'node:assert'
import { describe, it } from 'node:test'
import {
	countdownTone,
	countdownView,
	formatCountdown,
	GRACE_MS,
} from '../src/client/countdown.ts'

const H = 3_600_000
const D = 24 * H

describe('countdown format', () => {
	it('formats days, hours, minutes', () => {
		assert.strictEqual(formatCountdown(4 * D + 6 * H), '4d 06h')
		assert.strictEqual(formatCountdown(3 * D), '3d 00h')
		assert.strictEqual(formatCountdown(D - 1000), '23h 59m')
		assert.strictEqual(formatCountdown(H), '1h 00m')
		assert.strictEqual(formatCountdown(H - 1000), '59m 59s')
		assert.strictEqual(formatCountdown(42 * 60_000 + 10_000), '42m 10s')
	})

	it('clamps zero and negative', () => {
		assert.strictEqual(formatCountdown(0), '0m 00s')
		assert.strictEqual(formatCountdown(-5000), '0m 00s')
		assert.strictEqual(formatCountdown(NaN), '0m 00s')
	})
})

describe('countdown tone', () => {
	it('flips to amber at 3 days', () => {
		assert.strictEqual(countdownTone(3 * D + 1, 'LIVE'), 'neutral')
		assert.strictEqual(countdownTone(3 * D, 'LIVE'), 'warn')
		assert.strictEqual(countdownTone(H, 'LIVE'), 'warn')
		assert.strictEqual(countdownTone(0, 'LIVE'), 'warn')
		assert.strictEqual(countdownTone(-1, 'LIVE'), 'warn')
	})

	it('is red when overdue', () => {
		assert.strictEqual(countdownTone(-D, 'GRACE'), 'danger')
		assert.strictEqual(countdownTone(-D, 'FROZEN'), 'danger')
		assert.strictEqual(countdownTone(10 * D, 'GRACE'), 'danger')
	})
})

describe('countdown view', () => {
	const now = Date.parse('2026-01-01T00:00:00Z')
	const at = (ms: number) => new Date(now + ms).toISOString()

	it('switches to seconds in the last hour', () => {
		const far = countdownView({ dueAt: at(4 * D + 6 * H), status: 'LIVE', now })
		assert.strictEqual(far?.text, 'Next proof due in 4d 06h')
		assert.strictEqual(far?.fast, false)
		const soon = countdownView({
			dueAt: at(42 * 60_000 + 10_000), status: 'LIVE', now,
		})
		assert.strictEqual(soon?.text, 'Due in 42m 10s')
		assert.strictEqual(soon?.fast, true)
		const edge = countdownView({ dueAt: at(H + 1000), status: 'LIVE', now })
		assert.strictEqual(edge?.fast, false)
		const hour = countdownView({ dueAt: at(H), status: 'LIVE', now })
		assert.strictEqual(hour?.fast, true)
	})

	it('shows grace end, derived or given', () => {
		const dueAt = at(-5 * D)
		const derived = countdownView({ dueAt, status: 'GRACE', now })
		assert.strictEqual(derived?.text, 'Proof overdue · grace ends in 9d 00h')
		assert.strictEqual(derived?.target, at(-5 * D + GRACE_MS))
		const given = countdownView({
			dueAt, status: 'FROZEN', graceEndsAt: at(9 * D + 2 * H), now,
		})
		assert.strictEqual(given?.text, 'Proof overdue · grace ends in 9d 02h')
		assert.strictEqual(given?.tone, 'danger')
		const over = countdownView({ dueAt: at(-20 * D), status: 'GRACE', now })
		assert.strictEqual(over?.text, 'Proof overdue · grace ended')
	})

	it('handles terminal and missing states', () => {
		assert.strictEqual(
			countdownView({ dueAt: at(D), status: 'DEFAULTED', now })?.text,
			'Defaulted',
		)
		assert.strictEqual(
			countdownView({ dueAt: at(D), status: 'COMPLETED', now })?.text,
			'Term complete',
		)
		assert.strictEqual(
			countdownView({ dueAt: 'nope', status: 'LIVE', now }),
			null,
		)
		assert.strictEqual(
			countdownView({ dueAt: at(0), status: 'LIVE', now })?.text,
			'Proof due now',
		)
	})
})
