import assert from 'node:assert'
import { after, before, describe, it } from 'node:test'
import { bootApp, type BootedApp } from './utils.ts'

describe('skeleton smoke test', () => {
	let app: BootedApp
	before(async() => {
		app = await bootApp()
	})
	after(async() => {
		await app.close()
	})

	it('serves /healthz', async() => {
		const res = await app.fetch('/healthz')
		assert.strictEqual(res.status, 200)
		assert.strictEqual(await res.text(), 'ok')
	})

	it('renders GET / as HTML', async() => {
		const res = await app.fetch('/', { headers: { accept: 'text/html' } })
		assert.strictEqual(res.status, 200)
		const html = await res.text()
		assert.match(html, /<title>StakeMe Exchange<\/title>/)
		assert.match(html, /SMX/)
	})
})
