# 0G integration

Verified against npm and docs.0g.ai on 2026-11-06.

**Status:** implemented (see [Implementation notes](README.md#implementation-notes)).

SMX uses 0G for three things:

- 0G Private Computer (Router): run the LLM audit prompt through the
  OpenAI-compatible Router (default path, see [Router mode](#router-mode-audit-verdict)).
- 0G Compute (Galileo broker): run the same prompt through the SDK broker
  (opt-in). The audit checks a Reclaim proof against the L-ISA terms.
- 0G Storage: store the audit log (JSON) and keep its root hash in
  `income_proofs.audit_log_ref`.

## Real and simulated

| Part | State |
| --- | --- |
| 0G Private Computer audit through the Router | Real. Every income proof is audited there, with a request ID, model and provider on the proof row. |
| 0G Storage | Real, on Galileo. A worker uploads terms and audit logs in the background. |
| Date-window pre-check | Local code, not a 0G call. A deposit dated outside the reporting period is denied before the Router call. The audit log shows engine `pre-check`. |
| Rules engine | Offline dev only, behind `ZG_ALLOW_RULES_FALLBACK=1`, and labelled in the UI. |
| 0G Compute (SDK broker) | Off by default (`ZG_COMPUTE_ENABLED`). Needs a 3 0G ledger deposit. |
| Income data | The bank is a mock; the zkTLS proof of its response is real. |

## Packages and versions

The `@0glabs/*` packages are deprecated. Use the `@0gfoundation/*` packages.

| Package | Version | Status | Use |
| --- | --- | --- | --- |
| `@0gfoundation/0g-compute-ts-sdk` | 0.9.0 | Current | Compute broker (`createZGComputeNetworkBroker`). Node >= 20. |
| `@0gfoundation/0g-storage-ts-sdk` | 1.2.13 | Current | Storage (`Indexer`, `ZgFile`, `MemData`). |
| `ethers` | ^6.13.1 | Required peer | Signer and provider for both SDKs. |
| `@0glabs/0g-serving-broker` | 0.7.8 | Deprecated (renamed to the compute SDK above) | Don't use. |
| `@0glabs/0g-ts-sdk` | 0.3.3 | Deprecated ("no longer supported") | Don't use. |
| `@0gfoundation/0g-ts-sdk` | 1.2.8 | Exists, but the storage SDK above is what the docs use | Don't use. |

```bash
npm install @0gfoundation/0g-compute-ts-sdk @0gfoundation/0g-storage-ts-sdk ethers
```

SMX uses `viem` for its own chain code. The 0G SDKs need `ethers` v6, so
isolate them in `packages/app/src/integrations/zero-g.ts` and don't pass
ethers objects around.

## Galileo testnet

| Item | Value |
| --- | --- |
| Network | 0G Galileo Testnet |
| Chain id | `16602` |
| Currency | `0G` |
| RPC | `https://evmrpc-testnet.0g.ai` (development only) |
| Chain explorer | `https://chainscan-galileo.0g.ai` |
| Storage explorer | `https://storagescan-galileo.0g.ai` |
| Faucet | `https://faucet.0g.ai` (also a Google Cloud faucet at `cloud.google.com/application/web3/faucet/0g/galileo`) |
| Storage indexer (turbo) | `https://indexer-storage-testnet-turbo.0g.ai` |

## Environment variables

| Variable | Secret | Description |
| --- | --- | --- |
| `ZG_RPC_URL` | No | Default `https://evmrpc-testnet.0g.ai`. |
| `ZG_PRIVATE_KEY` | Yes | Funded key for the audit agent. Pays for storage and compute. |
| `ZG_INDEXER_URL` | No | Default `https://indexer-storage-testnet-turbo.0g.ai`. |
| `ZG_PROVIDER_ADDRESS` | No | Compute provider address (from `listService`). Default: the first chatbot service. |
| `ZG_LEDGER_DEPOSIT` | No | 0G to deposit into the compute ledger. Default `3`. |
| `ZG_COMPUTE_ENABLED` | No | `1` turns on the SDK broker path after the Router. Default off. |
| `ZG_STORAGE_MIN_BALANCE` | No | 0G balance floor for storage uploads. Default `0.1`. |
| `STORAGE_PROVIDER` | No | `0g` (default) or `local`. |
| `ZG_ROUTER_API_KEY` | Yes | 0G Router `sk-...` key. Set it to run the audit verdict through the Router. |
| `ZG_ROUTER_MGMT_KEY` | Yes | 0G Router `mk-...` management key (`account:read`) for the credit-balance readout. |
| `ZG_ROUTER_MODEL` | No | Default `0GM-1.0-35B-A3B,glm-5.3` (a preference list; both are `private` TEE models, the 0G-native model first). |
| `ZG_ROUTER_TRUST_MODE` | No | `standard`, `verified` or `private`, sent as `X-0G-Provider-Trust-Mode`. Default `private`; set it empty to omit the header. |
| `ZG_ALLOW_RULES_FALLBACK` | No | `1` lets the SQL rules engine audit when 0G is unreachable (offline dev only). Default off: the proof stays PENDING. |
| `ZG_ROUTER_BASE_URL` | No | Default `https://router-api.0g.ai/v1`. |

Without a Router key (or Compute) and without `ZG_ALLOW_RULES_FALLBACK=1`, audits stay PENDING (see [Demo fallback](#demo-fallback)).

## Compute: run the audit prompt

One-time setup per account: create the ledger and fund it. Then pick a
provider.

```ts
import { ethers } from 'ethers';
import { createZGComputeNetworkBroker } from '@0gfoundation/0g-compute-ts-sdk';

const provider = new ethers.JsonRpcProvider(process.env.ZG_RPC_URL);
const wallet = new ethers.Wallet(process.env.ZG_PRIVATE_KEY!, provider);
const broker = await createZGComputeNetworkBroker(wallet);

// One-time: create a ledger, then fund it. Skip if getLedger() succeeds.
try {
	await broker.ledger.getLedger();
} catch {
	await broker.ledger.addLedger(Number(process.env.ZG_LEDGER_DEPOSIT ?? 3));
}

const services = await broker.inference.listService();
const chat = services.filter((s) => s.serviceType === 'chatbot');
const providerAddress = process.env.ZG_PROVIDER_ADDRESS ?? chat[0].provider;
```

The docs say `broker.ledger.transferFund(provider, 'inference', amount)`
auto-acknowledges the provider's signer. The SDK also exposes
`broker.inference.acknowledgeProviderSigner(provider)` if you need it
explicitly. The method appears in the package types but not in the current
docs, so try `transferFund` first.

```ts
export async function runAudit(input: { terms: unknown; proof: unknown }) {
	const { endpoint, model } = await broker.inference.getServiceMetadata(providerAddress);
	const messages = [
		{
			role: 'system',
			content:
				'You audit income share agreements. Reply with JSON only: {"approved":boolean,"verified_amount":string,"reasoning":string}.',
		},
		{ role: 'user', content: JSON.stringify(input) },
	];
	const headers = await broker.inference.getRequestHeaders(providerAddress);
	const res = await fetch(`${endpoint}/chat/completions`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', ...headers },
		body: JSON.stringify({ model, messages }),
	});
	const data = await res.json();
	const answer = data.choices[0].message.content as string;

	// Optional: verify the TEE signature of the response.
	const chatId = res.headers.get('ZG-Res-Key') ?? data.id;
	const verified = chatId ? await broker.inference.processResponse(providerAddress, chatId) : null;

	return { audit: JSON.parse(answer), verified, model, provider: providerAddress };
}
```

Model output is untrusted. `parseAuditResponse` validates the JSON and throws
when `verified_amount` exceeds the deposit or an approval falls below
`minIncome`. The model never sets the dividend: `smx.audit_income_proof`
computes `round(verified_amount * share_bps / 10000, 6)`, and the model can
only veto an approval.

The docs also describe an OpenAI-compatible proxy: get a key with
`0g-compute-cli inference get-secret --provider <address>`, then call
`${service.url}/v1/proxy` with the `openai` package. That's simpler for
scripts but needs the CLI step.

## Router mode (audit verdict)

With `ZG_ROUTER_API_KEY` set, `runAuditVerdict` sends the strict-JSON audit
prompt to `POST {base}/chat/completions` (OpenAI-compatible, `Authorization:
Bearer sk-...`) and parses it with `parseAuditResponse` (it also drops a leaked
`...</think>` reasoning prefix). The request sets `temperature: 0`,
`max_tokens: 800`, `verify_tee: true`, `chat_template_kwargs.enable_thinking:
false` and `X-0G-Provider-Trust-Mode: private` (`ZG_ROUTER_TRUST_MODE`). One
request, 20 s timeout, no retries (a retry could be billed twice).

**Model.** Default `0GM-1.0-35B-A3B,glm-5.3`: the 0G-native model is tried first, and `glm-5.3` only after an unbilled overload (`429`, `502`, `503`). On 2026-11-06 `GET /v1/providers` lists `glm-5.3`
and `0GM-1.0-35B-A3B` as `private` (TeeML) providers; `glm-5.2` is served only
by `standard` third-party channels (Aliyun, Baidu, Tencent), which a `private`
or `verified` request rejects.

**Request ID and verification.** Every Router response carries `x_0g_trace`:
`request_id`, `provider` (on-chain address), `billing` (`total_cost_usd_micro`)
and `provider_identity`. `tee_verified` is documented as present only when
`verify_tee` is set. In two live calls on 2026-11-06 (`glm-5.2` standard and
`glm-5.3` private) the field was absent even with `verify_tee: true`, so the
audit records `teeVerified: null` and the UI shows "TEE verified" only when it
is `true`. For a `private` request the UI shows "Private routing (TEE provider)"
instead (tooltip: "Routed to a TEE provider by 0G; no attestation returned").
That label is the Router's routing guarantee, not a signature check. There is no
`ZG-Res-Key` header on Router responses, so the SDK's independent
`processResponse` check cannot run against them.

**Where it is recorded.** The audit log document (uploaded to 0G Storage by the
outbox) holds `engine: "0g-router"`, `model`, `requestId`, `providerAddress`,
`teeVerified`, `trustMode` and `routerTrace` (adds `costMicroUsd`,
`providerIdentity`). `income_proofs.audit` (jsonb, no new columns) holds the
same fields, and `income_proof_json` serves them as `engine`, `requestId`,
`providerAddress`, `teeVerified`, `trustMode` to the UI.

**Date pre-check.** Before any 0G call, the audit compares the proven deposit
date with the reporting period (the last 30 days for monthly creators, 90 for
quarterly). A deposit outside it is denied with "Deposit is outside the
reporting period", the log records engine `pre-check`, and no Router credit is
spent. A proof with no date (demo fixtures) skips the check. The model prompt
also carries the same rule.

**0G is required for approval.** If the Router call fails (`402`
`insufficient_balance`, `429`, `5xx`, timeout, bad JSON) and Compute is not
enabled, `runAuditVerdict` throws `ZeroGAuditUnavailable`. The pipeline does
not use the rules engine: `mark_audit_unavailable` leaves the proof `PENDING`
with `audit.status = "AUDIT_UNAVAILABLE"`, the route answers `202`, and the UI
shows "0G audit unavailable, retry". Submitting the same proof again retries
(`submit_income_proof` returns the existing PENDING row). Set
`ZG_ALLOW_RULES_FALLBACK=1` for offline dev to let the SQL rules engine audit;
the UI then labels it "Fallback: rules engine (0G unavailable)".

**Balance readout.** `GET /api/zero-g/balance` (`GetZeroGBalance`) reads
`GET {base}/account/balance` with `ZG_ROUTER_MGMT_KEY` (`mk-`, `account:read`),
caches it for 30 s and returns `creditUsd`. The Hub shows it as a pill that
refreshes every 30 s and after each oracle event.

A response that fails validation counts as a Router failure, so the proof
follows the "0G is required" path above.

## Storage: upload the audit log

```ts
import { Indexer, MemData } from '@0gfoundation/0g-storage-ts-sdk';
import { ethers } from 'ethers';

export async function uploadAuditLog(log: unknown) {
	const provider = new ethers.JsonRpcProvider(process.env.ZG_RPC_URL);
	const signer = new ethers.Wallet(process.env.ZG_PRIVATE_KEY!, provider);
	const indexer = new Indexer(process.env.ZG_INDEXER_URL!);

	const bytes = new TextEncoder().encode(JSON.stringify(log));
	const file = new MemData(bytes);

	const [tree, treeErr] = await file.merkleTree();
	if (treeErr !== null) throw new Error(`merkle tree: ${treeErr}`);

	const [tx, err] = await indexer.upload(file, process.env.ZG_RPC_URL!, signer);
	if (err !== null) throw new Error(`upload: ${err}`);

	return { rootHash: tree!.rootHash(), tx }; // store rootHash in income_proofs.audit_log_ref
}
```

Download to verify:

```ts
const err = await indexer.download(rootHash, './audit.json', true); // true = verify proof
```

In SMX the upload runs in the background: the request commits a
`local:<sha256>` ref and the worker uploads later (see the Worker section of
[backend.md](../backend.md)). Each upload takes about 30 seconds and costs about
0.0012 0G on Galileo. Uploads are skipped below `ZG_STORAGE_MIN_BALANCE`, retry
up to 3 times, and are deduplicated on the document's content hash.

Storagescan has no page keyed by root hash (only `/submission/<sequence>` and
`/address/<addr>`; checked 2026-11-07), so the UI links the log to
`https://indexer-storage-testnet-turbo.0g.ai/file/info/<root>`. That URL returns
the root, size and `finalized` flag as JSON.
The upload transaction appears on `https://chainscan-galileo.0g.ai/tx/<tx>`.

Notes on the storage API: older docs return `[tx, err]` tuples. The call shape
may differ across minor versions. Match the installed version's `.d.ts`.
`MemData` accepts `ArrayLike<number>`, so `Uint8Array` works.

## Browser-side

Don't call 0G from the browser. Compute needs a funded ledger and Storage needs
a funded signer. The server runs both and the UI shows the result. The only
browser piece is a link to the explorers.

## Testnet setup steps

1. Create an EVM account and copy the key into `ZG_PRIVATE_KEY`.
2. Get 0G from `https://faucet.0g.ai` (daily limits apply).
3. Run the compute snippet once to create the ledger and list providers.
4. Upload a test JSON log and open the storage explorer.
5. Add the network to your wallet: chain id `16602`, RPC above, symbol `0G`.

## Demo fallback

Offline dev only: with `ZG_ALLOW_RULES_FALLBACK=1` and no reachable 0G auditor,
`smx.audit_income_proof` gets the deterministic rules-engine verdict. The
`audit` jsonb records `{ "engine": "rules", "model": "rules-engine" }`,
`audit_log_ref` holds a local sha256 content hash prefixed `local:`, and the UI
says "Fallback: rules engine (0G unavailable)". Without the flag, no 0G means no
approval.

## Gotchas

- The old `@0glabs/*` names still resolve on npm but are deprecated. Docs and
  blog posts still show them.
- `ethers` is a peer dependency. Pin v6.
- `merkleTree()` must run before `indexer.upload`.
- Compute fails if the ledger has no balance or no funds are moved to the
  provider. Check balance first.
- Storage has two networks (turbo and standard) with different indexers. Use
  turbo for speed.
- The RPC is for development. Rate limits appear under load.
- The minimum ledger deposit is unverified. Start with 3 0G, and read the
  error message if it's rejected.

## Sources

- [0G Compute inference docs](https://docs.0g.ai/developer-hub/building-on-0g/compute-network/inference)
- [0G Storage SDK docs](https://docs.0g.ai/developer-hub/building-on-0g/storage/sdk)
- [Testnet overview](https://docs.0g.ai/developer-hub/testnet/testnet-overview)
- npm deprecation notices for `@0glabs/0g-serving-broker` and `@0glabs/0g-ts-sdk`
