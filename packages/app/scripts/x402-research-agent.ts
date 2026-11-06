/* eslint-disable @stylistic/max-len */
/**
 * Live x402 demo: an AI agent pays 0.1 HBAR on Hedera testnet to unlock
 * `GET /creators/{ticker}/audit-report`. Boots a short-lived SMX instance on
 * an in-memory PGlite (simulated chain), funds a throwaway payer from the
 * operator (0.15 HBAR), discovers the 402, signs, retries, prints the HashScan
 * link. Run: node --env-file=.env scripts/x402-agent.ts
 */
import {
	AccountCreateTransaction,
	AccountId,
	Client,
	Hbar,
	PrivateKey
} from '@hiero-ledger/sdk'
import { x402Client } from '@x402/core/client'
import { encodePaymentSignatureHeader } from '@x402/core/http'
import { createClientHederaSigner } from '@x402/hedera'
import { ExactHederaScheme } from '@x402/hedera/exact/client'

// The chain worker is not needed here: keep the simulated chain.
delete process.env.CHAIN_RPC_URL
const { createApp, createPgmbClient, endPgmb } = await import('../src/index.ts')
const { createSeededPglite } = await import('../tests/pglite.ts')

const pglite = await createSeededPglite()
const pg = pglite as never
const app = await createApp(pg)
const pgmb = createPgmbClient(pg)
await pgmb.init()
await pglite.exec('SET search_path TO smx, public')
await pglite.query(
	`WITH u AS (INSERT INTO users(email, name) VALUES ('demo@x402.test', 'demo') RETURNING id),
	c AS (INSERT INTO creators(owner_user_id, owner_wallet, ticker, display_name,
		target_raise, stake_amount, world_id_nullifier, status)
		SELECT id, '0x${'1'.repeat(40)}', 'MUSH', 'Mushroom Labs', 10000, 1000, '4242', 'LIVE' FROM u RETURNING id)
	INSERT INTO income_proofs(creator_id, period, provider, reclaim_proof_id,
		verified_amount, status, audit, audit_log_ref)
	SELECT id, 0, 'bank', 'p0', 4200, 'APPROVED',
		'{"verdict":"APPROVED","model":"0g-compute","reason":"income matches bank proof"}', 'local:demo' FROM c`,
)
app.listen(4031)
const base = 'http://localhost:4031'

// Throwaway payer, funded 0.15 HBAR by the operator.
const operatorId = AccountId.fromString(process.env.HEDERA_OPERATOR_ID!)
const operator = Client.forTestnet().setOperator(
	operatorId, PrivateKey.fromStringECDSA(process.env.HEDERA_OPERATOR_KEY!.replace(/^0x/, '')),
)
const payerKey = PrivateKey.generateECDSA()
const created = await new AccountCreateTransaction()
	.setKeyWithoutAlias(payerKey.publicKey)
	.setInitialBalance(new Hbar(0.15))
	.execute(operator)
const receipt = await created.getReceipt(operator)
const payerId = receipt.accountId!.toString()
operator.close()
console.log('payer account', payerId)
await new Promise((r) => setTimeout(r, 8000)) // mirror node must index the key

const url = `${base}/creators/MUSH/audit-report`
const first = await fetch(url)
console.log('unpaid ->', first.status)
const required = await first.json()
console.log('requirements', JSON.stringify(required.accepts[0]))

// Spending control: only HBAR on hedera:testnet, at most 0.2 HBAR a payment.
const client = new x402Client().setSpendControls({
	allowedAssets: [{
		network: 'hedera:testnet', asset: '0.0.0', maxAmountPerPayment: '20000000',
	}],
}).register(
	'hedera:*',
	new ExactHederaScheme(
		createClientHederaSigner(payerId, payerKey, { network: 'hedera:testnet' }),
	),
)
const payload = await client.createPaymentPayload(required)
const paid = await fetch(url, {
	headers: { 'X-PAYMENT': encodePaymentSignatureHeader(payload) },
})
console.log('paid ->', paid.status)
const body = await paid.json()
if(paid.status === 200) {
	const settle = JSON.parse(
		Buffer.from(paid.headers.get('x-payment-response')!, 'base64').toString(),
	)
	console.log('report', JSON.stringify({ ...body, payment: undefined }))
	console.log(`https://hashscan.io/testnet/transaction/${settle.transaction}`)
} else {
	console.log(JSON.stringify(body))
}

await endPgmb()
await app.destroy()
await pglite.close()
process.exit(0)
