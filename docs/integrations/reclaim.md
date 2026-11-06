# Reclaim Protocol integration

Verified against npm, the package README, and the Reclaim Builder docs on
2026-11-06.

SMX uses Reclaim zkTLS to prove that a creator received a bank deposit. The
`/mock-bank` page shows a hardcoded $5,000 deposit. The creator proves it,
the server verifies the proof, and the audit step turns it into an
`income_proofs` row.

## Packages and versions

| Package | Version | Use |
| --- | --- | --- |
| `@reclaimprotocol/js-sdk` | 5.8.3 | `ReclaimProofRequest`, `verifyProof`. SMX default. Works in the browser and Node. |
| `@reclaimprotocol/client` | 0.1.43 | Newer "Builder" session API (`build.reclaimprotocol.org`). Optional alternative. See [Newer Builder API](#newer-builder-api). |

```bash
npm install @reclaimprotocol/js-sdk
```

## Environment variables

| Variable | Secret | Description |
| --- | --- | --- |
| `RECLAIM_APP_ID` | No | Application id from the [Reclaim Developer Portal](https://dev.reclaimprotocol.org/). |
| `RECLAIM_APP_SECRET` | Yes | Application secret. Server only. Signs requests and binds TEE attestation. |
| `RECLAIM_PROVIDER_ID` | No | Provider id of the SMX bank-deposit provider. |
| `PUBLIC_BASE_URL` | No | Public URL for the callback (use a tunnel in dev). |
| `DEMO_MODE` | No | `1` accepts the fixture proof (see [Demo fallback](#demo-fallback)). |

## Flow

1. `POST /creators/{ticker}/reclaim-sessions` creates a `ReclaimProofRequest`
   on the server, sets the callback URL, and returns `requestUrl`,
   `statusUrl`, and the exported config.
2. The browser shows a QR code of `requestUrl` or calls
   `triggerReclaimFlow()`.
3. The user proves the deposit. Reclaim POSTs the proof to
   `POST /reclaim/callback`.
4. The server verifies the proof, rejects replays, reads the extracted
   amount, and calls `AuditMilestone`.

## Server-side

Create the session. Keep `appSecret` on the server.

```ts
import { ReclaimProofRequest } from '@reclaimprotocol/js-sdk';

export async function createReclaimSession(creatorId: string, period: number) {
	const req = await ReclaimProofRequest.init(
		process.env.RECLAIM_APP_ID!,
		process.env.RECLAIM_APP_SECRET!,
		process.env.RECLAIM_PROVIDER_ID!,
	);
	req.setAppCallbackUrl(`${process.env.PUBLIC_BASE_URL}/reclaim/callback`, true); // true = JSON body
	req.setContext(creatorId, JSON.stringify({ period })); // contextAddress, contextMessage
	// Persist these with the creator and period:
	return {
		sessionId: req.getSessionId(),
		providerVersion: req.getProviderVersion(),
		requestUrl: await req.getRequestUrl(),
		statusUrl: req.getStatusUrl(),
		config: req.toJsonString(), // browser can rebuild with ReclaimProofRequest.fromJsonString
	};
}
```

Receive and verify the proof. Reclaim sends the proof JSON to the callback
URL. The session id also arrives in the `X-Reclaim-Session-Id` header.

```ts
import { verifyProof } from '@reclaimprotocol/js-sdk';

app.post('/reclaim/callback', express.json({ limit: '1mb' }), async (req, res) => {
	const proof = req.body; // one proof object
	const sessionId = req.get('x-reclaim-session-id');
	const stored = await loadSession(sessionId); // providerVersion, creatorId, period
	if (!stored || (await sessionAlreadyUsed(sessionId))) return res.sendStatus(409);

	const { isVerified, data, error } = await verifyProof(proof, {
		...stored.providerVersion, // { providerId, providerVersion, allowedTags? }
		teeAttestation: { appSecret: process.env.RECLAIM_APP_SECRET! },
	});
	if (!isVerified) return res.status(400).json({ error: String(error) });

	const { context, extractedParameters } = data[0];
	const ctx = JSON.parse(proof.claimData.context);
	if (ctx.reclaimSessionId !== sessionId) return res.sendStatus(400);
	const ageS = Date.now() / 1000 - proof.claimData.timestampS;
	if (ageS > 15 * 60) return res.status(400).json({ error: 'stale proof' });

	await markSessionUsed(sessionId); // unique index on session id
	const amount = Number(extractedParameters.amount); // see provider parameters
	await auditMilestone({ creatorId: stored.creatorId, period: stored.period, amount, proof });
	res.sendStatus(200);
});
```

`verifyProof` returns `{ isVerified, isTeeAttestationVerified?, data, error? }`.
Each `data[i]` has `context` and `extractedParameters`. The proof itself holds
`claimData` with `provider`, `parameters`, `owner`, `timestampS`, `context`
(a JSON string), and `identifier`. Treat `extractedParameters` as strings.

Replay protection is your job. The SDK is stateless. Store each `sessionId`
once (unique index), require `teeAttestation`, and enforce a freshness window.

## Browser-side

```ts
import { ReclaimProofRequest } from '@reclaimprotocol/js-sdk';

export async function startReclaim(session: { config: string; requestUrl: string }) {
	const req = await ReclaimProofRequest.fromJsonString(session.config);
	// Option A: SDK picks extension, portal tab, or QR modal.
	await req.triggerReclaimFlow();
	// Option B: render session.requestUrl as a QR code yourself.
	await req.startSession({
		onSuccess: () => {
			// With a custom callback URL the proof goes to the server, so this
			// receives an empty array. Poll your own status route instead.
			htmx.trigger('#proof-status', 'refresh');
		},
		onError: (err) => console.error('Reclaim failed', err),
	});
}
```

`fromJsonString` is async in current versions. If your editor flags a type
mismatch, `await` it as shown.

Never put `RECLAIM_APP_SECRET` in a browser bundle. Before returning
`toJsonString()` to the browser, confirm the string doesn't contain the secret
(`!config.includes(process.env.RECLAIM_APP_SECRET)`). We haven't verified what
the SDK serializes. If it does include the secret, build the request URL on the
server only and return just `requestUrl` and `statusUrl`.

## Create the `/mock-bank` provider

A provider is the recipe for one data point on one site. The goal: prove that
`/mock-bank` shows a deposit of 5000.00 USD.

1. Make `/mock-bank` a real HTTPS page with an authenticated API call. zkTLS
   proves an HTTPS response, so the page must fetch its balance from an
   endpoint, for example `GET /mock-bank/api/transactions`, returning JSON:

   ```json
   { "account": "SMX Mock Bank", "transactions": [{ "id": "t1", "type": "deposit", "amount": "5000.00", "currency": "USD", "date": "2026-11-06" }] }
   ```

2. Host it on a public HTTPS URL (a tunnel such as ngrok or Cloudflare Tunnel
   works). Reclaim's attestor must reach it. `localhost` won't work.
3. Create the provider. Use either path:
   - **Developer Portal**: sign in at [dev.reclaimprotocol.org](https://dev.reclaimprotocol.org/),
     create an application (copy `appId` and `appSecret`), then use the
     provider creator to capture the request to `/mock-bank/api/transactions`.
   - **Reclaim MCP tools (Claude Code plugin)**: run `how_it_works`, then
     `attach_browser`, `start_capture`, `propose_provider`, `run_proof`,
     `create_provider`, `publish_provider_version`. These write the provider
     with the Builder backend.
4. Mark the data points:
   - Response match: `contains` `"amount":"{{amount}}"` and `"type":"deposit"`.
   - Response redaction: JSON path `$.transactions[0].amount`.
   - Extracted parameter: `amount` (so `extractedParameters.amount === "5000.00"`).
5. Mark session cookies or the auth header as secret parameters if the page
   needs login. For the demo, keep the endpoint unauthenticated and put the
   creator id in the context instead.
6. Run a test proof, then publish. Copy the provider id into
   `RECLAIM_PROVIDER_ID`.

If the Developer Portal flow blocks you, use the fallback.

## Demo fallback

With `DEMO_MODE=1` (or when `RECLAIM_APP_ID` is unset), skip the SDK. The
server accepts a fixture and treats it as verified. Never enable this in
production. Show a "Demo mode" badge.

```json
{
	"identifier": "0xdemo000000000000000000000000000000000000000000000000000000000001",
	"claimData": {
		"provider": "http",
		"parameters": "{\"url\":\"https://smx.local/mock-bank/api/transactions\",\"method\":\"GET\"}",
		"owner": "0x0000000000000000000000000000000000000001",
		"timestampS": 1793923200,
		"context": "{\"extractedParameters\":{\"amount\":\"5000.00\"},\"providerHash\":\"0xdemo\",\"reclaimSessionId\":\"demo-session-1\"}",
		"identifier": "0xdemo000000000000000000000000000000000000000000000000000000000001",
		"epoch": 1
	},
	"signatures": ["0xdemo"],
	"witnesses": [{ "id": "0x0000000000000000000000000000000000000002", "url": "wss://demo.local" }]
}
```

Generate `reclaimSessionId` and `timestampS` at request time so the replay and
freshness checks still run. Store `reclaim_proof_id = identifier` in
`income_proofs`.

## Newer Builder API

Reclaim now ships a Builder backend (`https://build.reclaimprotocol.org`) with
an org key (`RECLAIM_ORG_SECRET`), sessions (`POST /verifications/sessions`),
callback subscriptions, and `@reclaimprotocol/client`
(`reclaim.results.receive(body, { reclaimSessionId })`). It is the direction
the Reclaim MCP tools use. SMX defaults to `js-sdk` because the spec and the
free dev app flow use it. If provider creation through the MCP tools pushes
you to Builder, switch the two routes (`CreateReclaimSession`,
`ReclaimCallback`) and keep the rest. Don't mix both in one session.

## Gotchas

- `setAppCallbackUrl` makes `onSuccess` fire with an empty array. The proof
  goes only to your server.
- The callback needs a public URL. In dev, use a tunnel.
- `claimData.context` is a JSON string. `JSON.parse` it.
- Providers are versioned and immutable. Pass `providerVersion` from
  `getProviderVersion()` to `verifyProof`, so a later provider edit doesn't
  break old proofs.
- zkTLS can't prove a static HTML page's DOM text easily. Prefer an API
  endpoint.
- The js-sdk README still says "Current SDK Version: 5.2.0". Ignore that, the
  package is 5.8.3.

## Sources

- `@reclaimprotocol/js-sdk` README (npm, 5.8.3)
- [Reclaim docs](https://docs.reclaimprotocol.org/js-sdk/installation)
- Reclaim Builder guide via the Claude Code Reclaim plugin (`how_it_works`)
