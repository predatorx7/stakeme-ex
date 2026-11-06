# Arkiv entity schema: L-ISA terms record

StakeMe Exchange (SMX) stores each creator's liquid income share agreement
(L-ISA) terms as one Arkiv entity. This file defines that entity.

- SDK: `@arkiv-network/sdk` 1.0.1 (on `viem`)
- Network: Rabdi testnet, chain id `7794095`, gas token tGLM
- Integration guide: [`docs/integrations/arkiv.md`](../docs/integrations/arkiv.md)
- Schema name: `smx.lisa_terms` (the SDK tags every entity with an indexed
  `arkiv.schema` attribute holding this name)

## Why Arkiv

The terms must be readable by the investors, the 0G audit agent, and anyone
checking a dispute, and they must be tamper-evident. Arkiv gives us a public,
queryable record keyed by attributes (for example, "all LIVE terms for ticker
RAVI"). The terms hash is also stored in `LiquidISA` and in Postgres
(`creators.terms_hash`), so a lapsed Arkiv entity doesn't lose the commitment.

## Attributes

Indexed attributes are filterable in queries. Money is in USDC micro units
(6 decimals) stored as `u64`. Percentages of the raise are whole numbers.

| Attribute | SDK type | Indexed | Description |
| --- | --- | --- | --- |
| `creator_ticker` | `str` | Yes | Ticker, 3 to 6 uppercase letters. Unique per creator. |
| `creator_wallet` | `addr` | Yes | Creator's EVM address (the World ID signal). |
| `share_bps` | `u64` | Yes | Share of income in basis points. Default `500` (5%). |
| `term_months` | `u64` | Yes | Term length in months. Default `60`. |
| `target_raise` | `u64` | Yes | Raise target in USDC micro units. `10000000000` = 10,000 USDC. |
| `stake_amount` | `u64` | Yes | Creator stake in USDC micro units. `500000000` = 500 USDC. |
| `tranche_schedule` | `str` | No | JSON array of percentages summing to 100. Default `[20,40,40]`. |
| `world_id_nullifier_hash` | `str` | Yes | `keccak256` of the World ID nullifier (decimal string). Never the raw nullifier. |
| `terms_hash` | `str` | Yes | `sha256` (hex) of the canonical `terms` payload (see below). |
| `status` | `str` | Yes | `DRAFT`, `LIVE`, `GRACE`, `DEFAULTED`, `COMPLETED`. Mirrors `creator_status`. |
| `terms` | `bytes` | No | Canonical JSON payload (UTF-8). Up to 128 KiB. |
| `mimeType` | `str` | No | `application/json` (default). |

Entity fields set by Arkiv (use in `where`): `$key`, `$owner`, `$creator`,
`$expiresAt`.

### Why the nullifier is hashed

The raw nullifier is an action-scoped identifier. SMX stores only its hash in a
public record, so a reader can check that a creator's hash matches a
blacklist entry without learning the nullifier. The raw value stays in
Postgres (`creators.world_id_nullifier`, `blacklisted_nullifiers`).

## Content type

`application/json`. The `terms` bytes hold canonical JSON: keys sorted, no
whitespace, numbers as integers (micro units), strings in UTF-8. `terms_hash`
is `sha256(utf8(terms))` as lowercase hex.

## Expiry (BTL) policy

Arkiv caps an entity's life at about 182 days (7,884,000 blocks) per write or
extension.

| Event | Action |
| --- | --- |
| Create (IPO) | `ExpirationTime.max()` (about 182 days). |
| Every 150 days while `status` is `LIVE` or `GRACE` | `extendEntity` with `ExpirationTime.max()`. The worker runs this from the deadline sweep. |
| `COMPLETED` or `DEFAULTED` | Extend once more to `max()`, then stop. The record has served its purpose. |
| Lapsed entity | The authoritative commitment is `terms_hash` in `LiquidISA` and Postgres. Re-create the entity from the stored `terms` JSON. |

A 60-month term is 10 extensions. State this plainly in the demo.

## Example payload

The `terms` bytes (canonical JSON, shown pretty-printed):

```json
{
  "creator_ticker": "RAVI",
  "creator_wallet": "0x1111111111111111111111111111111111111111",
  "share_bps": 500,
  "term_months": 60,
  "target_raise": 10000000000,
  "stake_amount": 500000000,
  "tranche_schedule": [20, 40, 40],
  "world_id_nullifier_hash": "0x9f2c1a7d5b0e4c3a8e6f1b2d3c4a5b6c7d8e9f001122334455667788990011aa",
  "min_monthly_income": 1000000000,
  "proof_cadence_days": 30,
  "grace_days": 14,
  "version": 1
}
```

The full entity create call:

```ts
await walletClient.createEntity(
  LisaTerms,
  {
    creator_ticker: 'RAVI',
    creator_wallet: addr('0x1111111111111111111111111111111111111111'),
    share_bps: 500n,
    term_months: 60n,
    target_raise: 10_000_000_000n,
    stake_amount: 500_000_000n,
    tranche_schedule: '[20,40,40]',
    world_id_nullifier_hash: '0x9f2c...11aa',
    terms_hash: sha256Hex(canonicalJson),
    status: 'DRAFT',
    terms: stringToBytes(canonicalJson),
  },
  { expiration: ExpirationTime.max() },
);
```

## Schema definition (TypeScript)

```ts
import { addr, bytes, defineSchema, str, u64 } from '@arkiv-network/sdk/schema';

export const LisaTerms = defineSchema('smx.lisa_terms', {
  creator_ticker: str().indexed(),
  creator_wallet: addr().indexed(),
  share_bps: u64().indexed(),
  term_months: u64().indexed(),
  target_raise: u64().indexed(),
  stake_amount: u64().indexed(),
  world_id_nullifier_hash: str().indexed(),
  terms_hash: str().indexed(),
  status: str().indexed(),
  tranche_schedule: str(),
  terms: bytes(),
  mimeType: str().default('application/json'),
});
```

## Query examples

```ts
import { and, eq, gte } from '@arkiv-network/sdk/query';

// All LIVE L-ISAs
await publicClient.select({ $key: true, creator_ticker: true }).from(LisaTerms)
  .where(eq('status', 'LIVE')).limit(50).fetch();

// One creator's terms, newest first is not sortable by $createdAt; sort by key
await publicClient.select().from(LisaTerms)
  .where(eq('creator_ticker', 'RAVI')).limit(1).fetch();

// Find L-ISAs with a share of at least 5%, owned by SMX's writer
await publicClient.select({ $key: true, share_bps: true }).from(LisaTerms)
  .where(and(gte('share_bps', 500n), eq('status', 'LIVE')))
  .ownedBy(SMX_WRITER_ADDRESS).fetch();

// Check a nullifier hash against the record (for dispute tools)
await publicClient.select({ $key: true, status: true }).from(LisaTerms)
  .where(eq('world_id_nullifier_hash', hash)).fetch();

// Read by key and verify the hash
const row = await publicClient.getEntity(entityKey, LisaTerms);
const ok = sha256Hex(new TextDecoder().decode(row.terms.value)) === row.terms_hash.value;
```

Always filter with `.ownedBy(SMX_WRITER_ADDRESS)` (or check `$owner`) before
trusting a row. Anyone can write an entity with this schema name.

## Status updates

Use `patchEntity(LisaTerms, entityKey, { set: { status: 'GRACE' } })` for state
changes. A patch can't change the expiry, owner, or key, so `terms_hash` stays
valid only if `terms` is unchanged. Don't patch `terms`. Material changes
create a new entity and a new `terms_hash`.

## Fallback

Without an Arkiv key the app stores the same canonical JSON in Postgres and
sets `arkiv_entity_key` to `local:<terms_hash>`. The schema and hash rules
above still apply.
