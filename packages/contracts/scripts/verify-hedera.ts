// Verifies the Hedera testnet contracts on Sourcify, which HashScan reads.
// Posts the exact solc standard-json input from artifacts/build-info (the
// build that produced each artifact), so nothing is recompiled.
//
//   npm run verify:hedera              verify and print HashScan links
//
// HashScan's old host server-verify.hashscan.io now 308-redirects to the main
// Sourcify server, which lists Hedera testnet (296) as supported. No secrets
// are used: the script only reads deployments/hedera-testnet.json.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCIFY = 'https://sourcify.dev/server'
const MIRROR = 'https://testnet.mirrornode.hedera.com/api/v1'
const CHAIN = 296
const hashscan = (a: string) => `https://hashscan.io/testnet/contract/${a}`
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

type Dep = { contracts: Record<string, string> }
const dep = JSON.parse(readFileSync(join(root, 'deployments/hedera-testnet.json'), 'utf8')) as Dep

type Body = {
	match?: string
	verificationId?: string
	message?: string
	isJobCompleted?: boolean
	error?: { customCode?: string, message?: string }
	contract?: { match?: string }
	logs?: { topics: string[] }[]
	runtime_bytecode?: string
}

async function json(url: string, init?: RequestInit) {
	for(let i = 0; i < 5; i++) {
		const res = await fetch(url, init)
		const text = await res.text()
		try {
			return { status: res.status, body: JSON.parse(text) as Body }
		} catch{
			await sleep(2000)
		}
	}

	throw new Error(`Bad response from ${url}`)
}

async function status(address: string) {
	const { body } = await json(`${SOURCIFY}/v2/contract/${CHAIN}/${address}`)
	return body
}

async function verify(name: string, address: string) {
	const before = await status(address)
	if(before.match) {
		return `${name}: already verified (${before.match})`
	}

	const art = JSON.parse(readFileSync(join(root, `artifacts/contracts/${name}.sol/${name}.json`), 'utf8'))
	const info = JSON.parse(readFileSync(join(root, `artifacts/build-info/${art.buildInfoId}.json`), 'utf8'))
	const { status: code, body } = await json(`${SOURCIFY}/v2/verify/${CHAIN}/${address}`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			stdJsonInput: info.input,
			compilerVersion: info.solcLongVersion,
			contractIdentifier: `${art.inputSourceName}:${name}`,
		}),
	})
	if(!body.verificationId) {
		return `${name}: submit failed (${code}) ${body.message ?? JSON.stringify(body)}`
	}

	for(let i = 0; i < 40; i++) {
		await sleep(3000)
		const poll = await json(`${SOURCIFY}/v2/verify/${body.verificationId}`)
		const job = poll.body
		if(job.isJobCompleted) {
			return job.error
				? `${name}: FAILED ${job.error.customCode}: ${job.error.message}`
				: `${name}: ${job.contract?.match ?? 'verified'}`
		}
	}

	return `${name}: timed out`
}

// Newest clone created by the factory (EIP-1167), from ISACreated logs.
async function latestClone() {
	const f = dep.contracts.LiquidISAFactory
	const { body } = await json(`${MIRROR}/contracts/${f}/results/logs?limit=1&order=desc`)
	const log = body.logs?.[0]
	if(!log) {
		return undefined
	}

	return '0x' + log.topics[2].slice(26)
}

for(const name of ['MockUSDC', 'LiquidISA', 'CreatorShareToken', 'LiquidISAFactory']) {
	const address = dep.contracts[name]
	console.log(await verify(name, address))
	console.log(`  ${hashscan(address)}`)
}

// A clone is a 45-byte EIP-1167 proxy. Sourcify cannot match it to source
// (its bytecode is not the implementation's), so report the implementation it
// delegates to and whether that implementation is verified.
const clone = await latestClone()
if(clone) {
	const { body } = await json(`${MIRROR}/contracts/${clone}`)
	const code = String(body.runtime_bytecode ?? '').toLowerCase()
	const m = /^0x363d3d373d3d3d363d73([0-9a-f]{40})5af43d82803e903d91602b57fd5bf3$/.exec(code)
	if(m) {
		const impl = `0x${m[1]}`
		const implStatus = await status(impl)
		console.log(`ISA clone ${clone}: EIP-1167 proxy -> ${impl} (implementation: ${implStatus.match ?? 'unverified'})`)
	} else {
		console.log(`ISA clone ${clone}: not an EIP-1167 proxy`)
	}

	console.log(`  ${hashscan(clone)}`)
}
