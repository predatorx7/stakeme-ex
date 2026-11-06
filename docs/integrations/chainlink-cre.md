# Chainlink CRE integration

Verified against docs.chain.link and npm on 2026-11-06.

SMX models the proof, audit, and onchain call pipeline as a Chainlink Runtime
Environment (CRE) workflow. The pgmb worker runs the same steps in Node, so
the demo works without CRE. An optional real workflow lives in `cre/`.

## Packages and tools

| Item | Version | Use |
| --- | --- | --- |
| `cre` CLI | Install script, latest | Scaffold, simulate, deploy. |
| `@chainlink/cre-sdk` | 1.23.0 | Workflow SDK (TypeScript). |
| `@chainlink/cre-sdk-javy-plugin` | 1.7.0 | WASM compile plugin. Installed by the template's `postinstall`. |
| `viem` | 2.57.16 | ABI encoding inside the workflow. |
| Bun | >= 1.2.21 | Required by the TypeScript template. |

Install the CLI (macOS or Linux):

```bash
curl -sSL https://app.chain.link/cre/install.sh | bash
cre version
```

The TypeScript workflow compiles to WASM. It runs in a restricted runtime, so
you can't use Node APIs, `fs`, or most npm packages. Only use the SDK and
pure JavaScript libraries such as `viem`.

## Environment variables

| Variable | Secret | Description |
| --- | --- | --- |
| `CRE_ETH_PRIVATE_KEY` | Yes | Funded key. Needed for `--broadcast`. Goes in `cre/.env`. |
| `CRE_TARGET` | No | `staging-settings`. |
| `CRE_HTTP_TRIGGER_URL` | No | Where the app POSTs when a deployed workflow exists. Unset means the pgmb worker handles it. |
| `CRE_AUTHORIZED_ADDRESS` | No | EVM address allowed to call the HTTP trigger. |

## Project layout

`cre init` scaffolds the project. Keep it self-contained.

```
cre/
  project.yaml            # RPC URLs per target
  .env                    # CRE_ETH_PRIVATE_KEY (gitignored)
  smx-income-workflow/
    main.ts
    workflow.yaml         # staging-settings / production-settings
    config.staging.json
    package.json
```

```bash
cd cre && cre init            # choose TypeScript
cd smx-income-workflow && bun install
```

`project.yaml` must list an RPC URL for every chain the workflow uses. Without
it, the simulator cannot register the EVM capability.

## Workflow: HTTP trigger, verify, write onchain

The app POSTs `{ proofId, creatorId, period, verifiedAmount, proofHash }`
after it has verified the Reclaim proof. The workflow:

1. Receives the HTTP trigger.
2. Calls the SMX audit endpoint (or 0G) with consensus, so every node agrees.
3. Encodes a report and writes it to the consumer contract.

Per the Pitch Q&A: verify the large Reclaim proof JSON in the SMX backend and
pass only a hash and the verified numbers to CRE. Don't push the proof through
the workflow.

```ts
import {
	HTTPCapability, HTTPClient, EVMClient, handler, Runner, getNetwork, decodeJson,
	consensusIdenticalAggregation, hexToBase64, bytesToHex, TxStatus,
	type Runtime, type HTTPPayload,
} from '@chainlink/cre-sdk';
import { encodeAbiParameters, parseAbiParameters } from 'viem';

type Config = {
	authorizedEVMAddress: string;
	auditUrl: string;
	chainName: string; // for example 'ethereum-testnet-sepolia'
	consumerAddress: string;
	gasLimit: string;
};
type Trigger = { creatorId: string; period: number; verifiedAmount: string; proofHash: string };
type Audit = { approved: boolean; dividend: string };

const audit = (sendRequester: any, url: string, body: string): Audit => {
	const res = sendRequester.sendRequest({ url, method: 'POST', body: Buffer.from(body).toString('base64'),
		headers: { 'Content-Type': 'application/json' } }).result();
	return JSON.parse(new TextDecoder().decode(res.body));
};

const onHttp = (runtime: Runtime<Config>, payload: HTTPPayload): string => {
	const t = decodeJson<Trigger>(payload.input);

	const http = new HTTPClient();
	const result = http
		.sendRequest(runtime, audit, consensusIdenticalAggregation<Audit>())(runtime.config.auditUrl, JSON.stringify(t))
		.result();
	if (!result.approved) return 'rejected';

	const network = getNetwork({ chainFamily: 'evm', chainSelectorName: runtime.config.chainName });
	if (!network) throw new Error('unknown chain');
	const evm = new EVMClient(network.chainSelector.selector);

	// Struct encoded for the consumer's onReport(bytes metadata, bytes report)
	const data = encodeAbiParameters(
		parseAbiParameters('bytes32 creatorId, uint256 period, uint256 dividend, bytes32 proofHash'),
		[t.creatorId as `0x${string}`, BigInt(t.period), BigInt(result.dividend), t.proofHash as `0x${string}`],
	);
	const report = runtime
		.report({ encodedPayload: hexToBase64(data), encoderName: 'evm', signingAlgo: 'ecdsa', hashingAlgo: 'keccak256' })
		.result();
	const write = evm
		.writeReport(runtime, { receiver: runtime.config.consumerAddress, report, gasConfig: { gasLimit: runtime.config.gasLimit } })
		.result();
	if (write.txStatus !== TxStatus.SUCCESS) throw new Error(`write failed: ${write.errorMessage}`);
	return bytesToHex(write.txHash ?? new Uint8Array(32));
};

const init = (config: Config) => [
	handler(
		new HTTPCapability().trigger({
			authorizedKeys: [{ type: 'KEY_TYPE_ECDSA_EVM', publicKey: config.authorizedEVMAddress }],
		}),
		onHttp,
	),
];

export async function main() {
	const runner = await Runner.newRunner<Config>();
	await runner.run(init);
}
```

The HTTP client and consensus signatures above follow the SDK reference
(`HTTPClient.sendRequest(runtime, fn, aggregation)`). Confirm exact types in
`@chainlink/cre-sdk` 1.23.0 when you build it: the base64 body handling and
helper names are the likeliest to differ. Treat this as a design sketch, not a
compiled sample.

## Simulate

```bash
cd cre
cre workflow simulate smx-income-workflow --target staging-settings            # interactive
cre workflow simulate smx-income-workflow --non-interactive --trigger-index 0 \
  --http-payload @./payload.json --target staging-settings                       # scripted
cre workflow simulate smx-income-workflow --broadcast --target staging-settings  # sends real txs
```

By default, onchain writes are a dry run. `--broadcast` sends a transaction and
needs a funded `CRE_ETH_PRIVATE_KEY`. For an HTTP trigger, an empty
`authorizedKeys` config works in simulation, but a deployed workflow needs
authorized keys.

`payload.json`:

```json
{ "creatorId": "0x...32bytes", "period": 3, "verifiedAmount": "5000000000", "proofHash": "0x...32bytes" }
```

## Consumer contract requirement

CRE doesn't call your contract directly. It sends a signed report to a Chainlink
`KeystoneForwarder`, and the forwarder calls `onReport(bytes metadata, bytes report)`
on a **consumer contract implementing `IReceiver`**.

This affects `LiquidISA`. Today `unlockNextTranche()` is "only the oracle". To
use real CRE, add a small `CREReceiver` (or `onReport`) that the forwarder
calls and that, in turn, calls `unlockNextTranche` and `distributeDividend`
accounting. Set `oracle` to that receiver. The contracts workstream owns this.
Keep the EOA-oracle path for the pgmb worker.

## Chains

CRE supports specific chains. Our docs check found Ethereum Sepolia and Arc
Testnet in the supported list for TypeScript. We found no Hedera or 0G
Galileo. So a real CRE write targets **Ethereum Sepolia or Arc Testnet**, not
Hedera. That is the main reason the real workflow is optional.

Practical options:

- **Demo**: simulate with `--broadcast` against Sepolia, using a tiny consumer
  contract that emits the dividend/tranche event. Show the tx on Etherscan.
- **Main path**: the pgmb worker writes to Hedera with `viem`. The CRE
  workflow is the same logic, shown in simulation.

## How SMX models it

| CRE step | pgmb worker equivalent |
| --- | --- |
| HTTP trigger | `POST /api/audit-milestone` enqueues a pgmb job. |
| HTTP call with consensus | Worker calls 0G audit (or SQL rules). |
| `runtime.report` + `writeReport` | Worker sends `chain_jobs` rows with `viem`. |

Use the same JSON payload for both so the UI can show either path.

## Demo fallback

If `CRE_HTTP_TRIGGER_URL` is unset, the worker runs the pipeline and logs
"CRE (simulated by worker)". The UI shows a "Chainlink CRE workflow" step with
the same events. Don't claim a decentralized DON ran it.

## Gotchas

- Bun >= 1.2.21 is required for the TypeScript template.
- The WASM runtime restricts imports. If a library needs Node, it won't run.
- Set a sufficient `gasLimit` in `writeReport` or the write fails out of gas.
- `txStatus` and `receiverContractExecutionStatus` are independent. Check both.
- HTTP triggers in deployed workflows require `authorizedKeys`.
- Deployment needs CRE access (`cre login`) and can need an approved account.
  Plan for simulation only at a hackathon.

## Sources

- [CRE docs index](https://docs.chain.link/cre/llms.txt)
- [Simulating workflows](https://docs.chain.link/cre/guides/operations/simulating-workflows.md)
- [HTTP trigger](https://docs.chain.link/cre/guides/workflow/using-triggers/http-trigger/configuration-ts.md)
- [Onchain write](https://docs.chain.link/cre/guides/workflow/using-evm-client/onchain-write/overview-ts.md)
- [Supported networks (TypeScript)](https://docs.chain.link/cre/supported-networks-ts.md)
