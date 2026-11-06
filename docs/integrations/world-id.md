# World ID integration

Verified against npm and docs.world.org on 2026-11-06.

SMX uses World ID to prove that a creator is a unique human before they launch
an L-ISA. The proof yields an action-scoped nullifier. SMX stores the
nullifier on the creator row (`creators.world_id_nullifier`, unique) and in
`blacklisted_nullifiers` after a default, so a defaulted creator can't launch
again.

## Packages and versions

| Package | Version | Use |
| --- | --- | --- |
| `@worldcoin/idkit-core` | 4.6.0 | Framework-neutral client (`IDKit.request`), plus server helpers on subpaths `/signing` and `/hashing`. Works in the browser and Node 18+. No WASM. |
| `@worldcoin/idkit-server` | 1.2.0 | Installed automatically as a dependency. Exports `Nullifier` (parse and compare nullifiers). |
| `@worldcoin/idkit` | 4.6.0 | React widget. Don't use it. SMX has no React. |

```bash
npm install @worldcoin/idkit-core
```

SMX targets World ID 4.0 (IDKit 4.x). Don't use the old
`@worldcoin/idkit-standalone` or the `/api/v2/verify/{app_id}` endpoint.

## Environment variables

| Variable | Secret | Description |
| --- | --- | --- |
| `WORLD_APP_ID` | No | `app_...` from the [Developer Portal](https://developer.world.org). |
| `WORLD_RP_ID` | No | `rp_...` from the Developer Portal (registered relying party). |
| `WORLD_RP_SIGNING_KEY` | Yes | Hex signing key from the Developer Portal. Never send it to the browser. |
| `WORLD_ACTION` | No | Action id, for example `smx-launch-ipo`. |
| `WORLD_ENV` | No | `staging` (Simulator) or `production`. Default `staging`. |
| `DEMO_MODE` | No | `1` skips real verification and accepts the fixture (see [Demo fallback](#demo-fallback)). |

## How it works

1. The browser asks the server for an RP signature for the action.
2. The browser calls `IDKit.request(...)` with the signature and shows
   `request.connectorURI` as a QR code (or deep link).
3. The user approves in World App or the Simulator. `pollUntilCompletion()`
   returns an IDKit result.
4. The browser posts the result, unchanged, to `POST /creators`.
5. The server checks the environment, checks the signal binding, forwards the
   result to the Developer Portal, then stores the nullifier.

## Server-side

### Sign the request

```ts
import { signRequest } from '@worldcoin/idkit-core/signing';

// GET/POST /api/world-id/rp-signature
app.post('/api/world-id/rp-signature', (req, res) => {
	const { sig, nonce, createdAt, expiresAt } = signRequest({
		signingKeyHex: process.env.WORLD_RP_SIGNING_KEY!,
		action: process.env.WORLD_ACTION!,
	});
	res.json({ sig, nonce, created_at: createdAt, expires_at: expiresAt });
});
```

### Verify the proof

Forward the IDKit result as is. Don't remap fields.

```ts
import { hashSignal } from '@worldcoin/idkit-core/hashing';
import { Nullifier } from '@worldcoin/idkit-server/nullifier';

type IDKitResult = {
	environment: string;
	action?: string;
	responses: { identifier: string; nullifier?: string; signal_hash: string }[];
};

export async function verifyWorldId(result: IDKitResult, expectedSignal: string) {
	const expectedEnv = process.env.WORLD_ENV ?? 'staging';
	if (result.environment !== expectedEnv) throw new Error('wrong World ID environment');
	if (result.action !== process.env.WORLD_ACTION) throw new Error('wrong action');

	// Signal binding: the proof must commit to the wallet address.
	const response = result.responses[0];
	if (response.signal_hash.toLowerCase() !== hashSignal(expectedSignal).toLowerCase()) {
		throw new Error('signal mismatch');
	}

	const res = await fetch(`https://developer.world.org/api/v4/verify/${process.env.WORLD_RP_ID}`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ ...result, environment: expectedEnv }),
	});
	const body = await res.json();
	if (!res.ok || body.success !== true || body.environment !== expectedEnv) {
		throw new Error('World ID verification failed');
	}

	// Store as a decimal string for NUMERIC(78,0), or use toCanonicalString().
	return Nullifier.fromHex(response.nullifier!).toBigInt().toString();
}
```

The Developer Portal checks that the proof is valid. It doesn't track
duplicates. Your database does that: `smx.launch_ipo` must reject a nullifier
that is already used or blacklisted. Add a unique constraint on the stored
nullifier (the Developer Portal recommends `UNIQUE (nullifier, action)`).

### Signal binding

Use the creator's wallet address (lowercase) as the signal. The signal is
hashed into the proof, so the proof can't be replayed for another wallet.

- Browser: `proofOfHuman({ signal: walletAddress })`.
- Server: `hashSignal(walletAddress)` must equal `responses[0].signal_hash`.
  Use the wallet from the Better Auth SIWE session, not from the request body.

## Browser-side

Framework-neutral. Bundle with Vite as a plain module.

```ts
import { IDKit, proofOfHuman } from '@worldcoin/idkit-core';

export async function verifyHuman(appId: string, rpId: string, action: string, wallet: string, env: 'staging' | 'production') {
	const rp = await fetch('/api/world-id/rp-signature', { method: 'POST' }).then((r) => r.json());

	const request = await IDKit.request({
		app_id: appId,
		action,
		rp_context: {
			rp_id: rpId,
			nonce: rp.nonce,
			created_at: rp.created_at,
			expires_at: rp.expires_at,
			signature: rp.sig,
		},
		allow_legacy_proofs: true,
		environment: env, // 'staging' for the Simulator
	}).preset(proofOfHuman({ signal: wallet.toLowerCase() }));

	showQr(request.connectorURI); // render with any QR helper

	const completion = await request.pollUntilCompletion({ timeout: 120_000 });
	if (!completion.success) throw new Error(String(completion.error));
	return completion.result; // POST this unchanged to /creators
}
```

If you hit a type error on the preset (the 3.0 compatible preset is
`orbLegacy`), swap `proofOfHuman` for `orbLegacy`. Both take `{ signal }`.

## Simulator and staging setup

1. Open the [Developer Portal](https://developer.world.org) and create an app.
   Copy the `app_id`, `rp_id`, and `signing_key`.
2. Create an action named like `WORLD_ACTION` with environment **staging**.
   Create a separate **production** action if you test with a real phone.
3. Set `WORLD_ENV=staging` and the three env values.
4. Open the [Simulator](https://simulator.worldcoin.org), paste the connect
   URI (the QR content) from `request.connectorURI`, and approve.
5. A staging action verifies only against the Simulator. A production action
   fails silently with the Simulator.

## Demo fallback

If `WORLD_APP_ID` is unset or `DEMO_MODE=1`, skip IDKit and the Developer
Portal call. The server accepts a fixture result and derives a deterministic
fake nullifier: `keccak256(wallet + ':' + action)`. Show a "Demo mode" badge
in the UI. To demo the blacklist, use two wallets that map to the same fake
nullifier by posting the same `demoNullifier` field (accepted only when
`DEMO_MODE=1`).

```json
{
	"environment": "staging",
	"action": "smx-launch-ipo",
	"responses": [{ "identifier": "proof_of_human", "signal_hash": "0x0", "nullifier": "0x2bf8...fbd8" }]
}
```

## Gotchas

- Environment mismatch is the most common failure. The IDKit `environment`,
  the Developer Portal action, and the verifier (Simulator or phone) must match.
- RP signatures expire. Fetch a fresh one per request. Never sign in the browser.
- Nullifiers are 256-bit. Don't store them as JS numbers. Use `bigint` or text.
- A nullifier is scoped to the action. Changing `WORLD_ACTION` resets
  uniqueness and defeats the blacklist. Keep one action id for launches.
- The `signal_hash` for a request with no signal is `0x0`.
- The `/creators` mutation must read the wallet from the session. Otherwise an
  attacker can pick the signal they like.
- Ask the World booth (from the pitch playbook) whether you can query contract
  state before the modal opens to block blacklisted nullifiers. Until then,
  the check runs after verification.

## Sources

- [IDKit integration guide](https://docs.world.org/world-id/idkit/integrate.md)
- [POST /v4/verify reference](https://docs.world.org/api-reference/developer-portal/verify.md)
- `@worldcoin/idkit-core` README (npm, 4.6.0)
