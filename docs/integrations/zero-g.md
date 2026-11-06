# 0G integration

Verified against npm and docs.0g.ai on 2026-11-06.

**Status:** implemented (see [Implementation notes](README.md#implementation-notes)).

SMX uses 0G for two things:

- **0G Compute**: run the LLM audit prompt that checks a Reclaim proof against
  the L-ISA terms and computes the dividend.
- **0G Storage**: store the audit log (JSON) and keep its root hash in
  `income_proofs.audit_log_ref`.

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
| `ZG_RPC_URL` | No | `https://evmrpc-testnet.0g.ai`. |
| `ZG_PRIVATE_KEY` | Yes | Funded key for the audit agent. Pays for storage and compute. |
| `ZG_INDEXER_URL` | No | `https://indexer-storage-testnet-turbo.0g.ai`. |
| `ZG_PROVIDER_ADDRESS` | No | Compute provider address (from `listService`). |
| `ZG_LEDGER_DEPOSIT` | No | 0G to deposit into the compute ledger, for example `3`. |

Unset `ZG_PRIVATE_KEY` means the SQL rules engine runs (see [Demo fallback](#demo-fallback)).

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
explicitly. We saw the method in the package types but not in the current docs,
so try `transferFund` first.

```ts
export async function runAudit(input: { terms: unknown; proof: unknown }) {
	const { endpoint, model } = await broker.inference.getServiceMetadata(providerAddress);
	const messages = [
		{
			role: 'system',
			content:
				'You audit income share agreements. Reply with JSON only: {"approved":boolean,"verified_amount":number,"dividend":number,"reasons":string[]}.',
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

Model output is untrusted. Validate the JSON with a schema. Never let the
model's `dividend` override the SQL formula: recompute
`verified_amount * share_bps / 10000` in `smx.audit_income_proof` and treat the
model output as advisory plus audit trail.

The docs also describe an OpenAI-compatible proxy: get a key with
`0g-compute-cli inference get-secret --provider <address>`, then call
`${service.url}/v1/proxy` with the `openai` package. That's simpler for
scripts but needs the CLI step.

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

Link the log in the UI: `https://storagescan-galileo.0g.ai` plus the root hash.
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

With no `ZG_PRIVATE_KEY`, `smx.audit_income_proof` is the deterministic rules
engine. The `audit` jsonb records `{ "engine": "rules", "approved": true }`
and `audit_log_ref` holds a local sha256 content hash prefixed `local:`. When
0G is on, store `engine: "0g-compute"` plus provider and model so judges can
tell the two apart.

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
- We did not verify the minimum ledger deposit. Start with 3 0G, and read the
  error message if it's rejected.
- Ask the 0G booth (pitch playbook) which storage telemetry logs the judges
  want for the "safe-stop" fallback.

## Sources

- [0G Compute inference docs](https://docs.0g.ai/developer-hub/building-on-0g/compute-network/inference)
- [0G Storage SDK docs](https://docs.0g.ai/developer-hub/building-on-0g/storage/sdk)
- [Testnet overview](https://docs.0g.ai/developer-hub/testnet/testnet-overview)
- npm deprecation notices for `@0glabs/0g-serving-broker` and `@0glabs/0g-ts-sdk`
