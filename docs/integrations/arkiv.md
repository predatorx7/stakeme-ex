# Arkiv integration

Verified against the `@arkiv-network/sdk` 1.0.1 package (README and types) on
2026-11-06. Arkiv is the successor to Golem DB.

**Status:** implemented (see [Implementation notes](README.md#implementation-notes)).

SMX stores each creator's L-ISA terms as an Arkiv entity with queryable
attributes. `creators.arkiv_entity_key` holds the entity key and
`creators.terms_hash` holds the hash of the terms payload. The 0G audit agent
reads the terms from Arkiv (or the local copy) when it checks a proof.

The prize requires two files at the repo root: [`/arkiv/schema.md`](../../arkiv/schema.md)
and [`/arkiv/friction.md`](../../arkiv/friction.md). They exist.

## Packages and versions

| Package | Version | Use |
| --- | --- | --- |
| `@arkiv-network/sdk` | 1.0.1 | Arkiv client. Built on `viem` (peer dependency). Needs Node >= 22.10. |
| `viem` | ^2 (2.57.16 current) | Peer dependency. SMX already uses it. |

```bash
npm install @arkiv-network/sdk viem
```

Subpath exports: `@arkiv-network/sdk` (clients, `ExpirationTime`),
`/chains` (`rabdi`, `localhost`), `/query` (`eq`, `gt`, `and`, `asc`, `desc`,
...), `/schema` (`defineSchema`, `str`, `u64`, `dec`, `addr`, `bytes`, `bool`,
`key`, `i32`, `u256`), plus `/entity`, `/types`, `/utils`.

## Testnet

| Item | Value |
| --- | --- |
| Testnet name | Rabdi |
| Chain id | `7794095` |
| Gas token | tGLM (18 decimals) |
| RPC | `https://rpc.rabdi.db-chain.testnet.arkiv.network/<access-key>` (WebSocket: `wss://` same host) |
| Explorer | `https://rabdi.explorer.arkiv.network` |
| Access key | Free key at `https://hub.arkiv.network/access-keys` |
| Faucet | `https://hub.arkiv.network/faucet` |

The RPC host is `rpc.rabdi.db-chain.testnet.arkiv.network`. The `rabdi()`
helper builds the URL and appends your access key. The public endpoint (empty
access key) is heavily rate limited.

## Environment variables

| Variable | Secret | Description |
| --- | --- | --- |
| `ARKIV_ACCESS_KEY` | Yes | Access key from the Arkiv hub. Empty string works but is rate limited. |
| `ARKIV_PRIVATE_KEY` | Yes | Funded testnet key. Unset means local-record fallback. |

## Create an entity (server)

An entity has typed attributes (each can be indexed), a payload via `bytes`
columns, and an expiry. Define a schema once (see `/arkiv/schema.md`).

```ts
import { createPublicClient, createWalletClient, ExpirationTime } from '@arkiv-network/sdk';
import { rabdi } from '@arkiv-network/sdk/chains';
import { and, eq } from '@arkiv-network/sdk/query';
import { addr, bytes, defineSchema, str, u64 } from '@arkiv-network/sdk/schema';
import { http, stringToBytes } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

export const LisaTerms = defineSchema('smx.lisa_terms', {
	creator_ticker: str().indexed(),
	creator_wallet: addr().indexed(),
	share_bps: u64().indexed(),
	term_months: u64().indexed(),
	target_raise: u64().indexed(), // USDC in micro units (6 decimals)
	stake_amount: u64().indexed(),
	world_id_nullifier_hash: str().indexed(),
	terms_hash: str().indexed(),
	status: str().indexed(),
	tranche_schedule: str(), // JSON string of percentages, for example "[20,40,40]"
	terms: bytes(), // canonical JSON payload
	mimeType: str().default('application/json'),
});

const chain = rabdi({ accessKey: process.env.ARKIV_ACCESS_KEY ?? '' });
const account = privateKeyToAccount(process.env.ARKIV_PRIVATE_KEY as `0x${string}`);
const publicClient = createPublicClient({ chain, transport: http() });
const walletClient = createWalletClient({ chain, transport: http(), account });

export async function storeTerms(t: TermsRecord, canonicalJson: string) {
	const { entityKey, txHash } = await walletClient.createEntity(
		LisaTerms,
		{
			creator_ticker: t.ticker,
			creator_wallet: addr(t.wallet),
			share_bps: BigInt(t.shareBps),
			term_months: BigInt(t.termMonths),
			target_raise: BigInt(t.targetRaiseMicro),
			stake_amount: BigInt(t.stakeMicro),
			world_id_nullifier_hash: t.nullifierHash,
			terms_hash: t.termsHash,
			status: 'DRAFT',
			tranche_schedule: JSON.stringify(t.trancheBps),
			terms: stringToBytes(canonicalJson),
		},
		{ expiration: ExpirationTime.max() }, // see Expiry
	);
	return { entityKey, txHash };
}
```

`createEntity` resolves when the transaction is in a block. Use
`walletClient.patchEntity(LisaTerms, entityKey, { set: { status: 'LIVE' } })`
(patching never changes the expiry, owner, or key)
to change a column later. The values passed to `u64()` columns are `bigint`.

## Expiry (BTL)

Arkiv entities expire. Build the expiry with `ExpirationTime`:

- `fromSeconds/Minutes/Hours/Days(n)`: a lifetime from now.
- `atBlock(n)` / `atDate(date)`: a deadline.
- `max()`: the longest life the chain allows.

No entity may live more than `MAX_LIFETIME` blocks, about **182 days**, past the
block where it is created or extended. `fromYears(1)` is refused before the
transaction is sent (`MAX_LIFETIME` is 7,884,000 blocks). A 60-month term
can't be stored for the full term in one write. SMX must extend the entity
periodically with `walletClient.extendEntity({ entityKey, expiration })`.
An extension sets a new expiry (it doesn't add to the old one) and the engine
rejects one that moves the expiry earlier. The worker calls it on a schedule
(at least every ~150 days) and writes the new expiry to `creators`. If expiry lapses, the
authoritative copy is `terms_hash` onchain in `LiquidISA` plus the local
record. State this limit in the pitch ("terms re-pinned every 6 months").

## Query

```ts
const rows = await publicClient
	.select({ $key: true, creator_ticker: true, status: true, terms_hash: true })
	.from(LisaTerms)
	.where(and(eq('creator_ticker', 'RAVI'), eq('status', 'LIVE')))
	.limit(10)
	.fetch();

for (const r of rows.entities) console.log(r.$key, r.creator_ticker.value, r.terms_hash.value);

// By key, typed through the schema
const one = await publicClient.getEntity(entityKey, LisaTerms);
const terms = JSON.parse(new TextDecoder().decode(one.terms.value));
```

Only indexed columns are filterable. A named schema tags entities with an
indexed `arkiv.schema` attribute, so queries don't match other apps' data.
Entities from other writers that don't fit the schema are skipped and counted
in `skipped`. Always check the owner (`$owner`) and `terms_hash` before
trusting a row.

## Browser-side

Reads can use `createPublicClient` in the browser with a read-only access key.
Don't ship the writer key. The server writes entities. Link to the explorer
from the creator page.

## Demo fallback

Without `ARKIV_PRIVATE_KEY`, store the canonical JSON in
`creators.terms_json` (add the column, or keep it in `chain_jobs.args`) and set
`terms_hash = sha256(canonicalJson)`. Set `arkiv_entity_key` to
`local:<hash>`. Show an "Arkiv (local record)" badge.

## Gotchas

- **Expiry cap**: about 182 days. See [Expiry](#expiry-btl).
- **Block-aligned durations**: `fromSeconds` must be a multiple of the block time.
- **Node >= 22.10** for the SDK. SMX runs Node 24, so this is fine.
- **Access key**: the public endpoint is rate limited. Get a key before the
  hackathon starts.
- **Selection variable footgun**: pass `select({...})` inline, or use `as const`.
- **`bytes` can't be indexed** and holds up to 128 KiB.
- The SDK moved fast: docs examples written for `0.x` used different APIs
  (`createEntity` with raw attributes arrays). Check the version you read.
- Record friction in `/arkiv/friction.md` as you go. It is a prize requirement.

## Sources

- `@arkiv-network/sdk` README and type definitions (npm, 1.0.1)
- [Arkiv hub](https://hub.arkiv.network)
