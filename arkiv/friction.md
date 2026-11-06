# Arkiv developer experience friction log

A running log of friction we hit while building SMX on Arkiv. Honest and
specific beats polite. Each entry says what we tried, what happened, what we
expected, and what would fix it.

- SDK: `@arkiv-network/sdk`
- Team: StakeMe Exchange (SMX), ETHGlobal Mumbai
- Started: 2026-11-06

## How to add an entry

Copy the template, fill every field, and add it at the end of
[Hackathon log](#hackathon-log). Use UTC dates. Link the file or line if you
can.

```markdown
### YYYY-MM-DD HH:MM UTC: short title

- **Severity:** blocker | slow us down | papercut
- **Area:** SDK | docs | testnet RPC | faucet | explorer | query | expiry | other
- **What we tried:**
- **What happened:**
- **What we expected:**
- **Workaround:**
- **Suggested fix:**
```

## Pre-hackathon research (2026-11-06)

Found while reading the SDK package and docs before writing any app code. We
read the npm package (`1.0.1`, published 2026-11-02) and its README and type
definitions. We haven't yet sent a transaction.

### 2026-11-06: Stale version in the README's install snippet

- **Severity:** papercut
- **Area:** docs
- **What we tried:** Followed the README's project setup.
- **What happened:** The sample `package.json` shows `"@arkiv-network/sdk": "^0.9.0"`
  and says Node 22.10 or newer, while the published package is `1.0.1`.
  Examples written for `0.x` use older entity APIs, and blog posts and
  search results mix both.
- **What we expected:** Version numbers in the docs that match the published
  package, and a migration note for `0.x` to `1.x`.
- **Workaround:** Read the `.d.ts` files in `node_modules` as the source of
  truth.
- **Suggested fix:** Generate the snippet from the current version, and add a
  changelog or migration guide link in the README.

### 2026-11-06: Expiry limit is easy to miss

- **Severity:** slow us down
- **Area:** expiry
- **What we tried:** Plan a 60-month L-ISA record that should live for the
  whole term.
- **What happened:** The only mention of the cap is in the `ExpirationTime`
  type docs: no entity may live more than `MAX_LIFETIME` blocks (about 182
  days) past the block of its create or extension. `ExpirationTime.fromYears(1)`
  is rejected client-side. The README tutorial never mentions the cap.
- **What we expected:** A "limits" section in the README (max lifetime, max
  `bytes` size of 128 KiB, page size of 100).
- **Workaround:** Schedule `extendEntity` every ~150 days (see `schema.md`).
- **Suggested fix:** Document limits in one table. Offer a long-lived or
  auto-renewing option for records that must outlive 6 months.

### 2026-11-06: Access key and faucet are two separate sign-ups

- **Severity:** papercut
- **Area:** testnet RPC, faucet
- **What we tried:** Plan the hackathon setup.
- **What happened:** The public RPC is "heavily rate limited". A free access
  key comes from one page and testnet tGLM from another page. `rabdi()` throws
  `MissingAccessKeyError` if you don't pass `accessKey` at all, and prints a
  warning for `""`.
- **What we expected:** One sign-up, or a clear "no key, small quota" mode
  that works for a demo.
- **Workaround:** Get both before the hackathon. Use `rabdi({ accessKey: '' })`
  for read-only checks.
- **Suggested fix:** A single hub page that issues a key and funds the
  address.

### 2026-11-06: The schema layer is typed, but the node only sees attributes

- **Severity:** papercut
- **Area:** query
- **What we tried:** Read how `defineSchema` maps to what is on chain.
- **What happened:** The README says a schema is "an SDK-side convention: the
  node sees only attributes". So two apps using the same attribute names with
  different types collide, and anyone can write an entity that matches our
  schema name. Queries skip non-matching rows and report `skipped`, which is
  good, but trust still needs an `$owner` filter.
- **What we expected:** A short security note on trusting query results.
- **Workaround:** Always filter by `.ownedBy(writer)` and verify `terms_hash`.
- **Suggested fix:** Add a "trust and ownership" section to the query docs.

### 2026-11-06: Selection stored in a variable loses types

- **Severity:** papercut
- **Area:** SDK
- **What we tried:** Reuse a `select({...})` object between queries.
- **What happened:** The README calls it out as a footgun: a stored selection
  widens `true` to `boolean`, so every field becomes optional. It needs
  `as const`.
- **Suggested fix:** Make `select` generic over `const` parameters
  (TypeScript `const` type params) so it works without `as const`.

### 2026-11-06: Docs and examples assume `bun` or experimental TypeScript stripping

- **Severity:** papercut
- **Area:** docs
- **What we tried:** Run the example in a Node 24 ESM project.
- **What happened:** The README offers Bun, `--experimental-strip-types`, or
  a full `tsc` build. Our toolchain is Node 24 with Vite and `tsx`. It works,
  but the README doesn't say so.
- **Suggested fix:** State which runtimes are tested (Node 22, 24, Bun) and
  show a `tsx` example.

### 2026-11-06: Search results for the prize requirement

- **Severity:** papercut
- **Area:** docs
- **What we tried:** Find the official ETHGlobal prize page and any template
  for `schema.md` and `friction.md`.
- **What happened:** A web search for the Arkiv prize requirements returned
  other ETHGlobal events but nothing for Arkiv. We could not verify the
  exact wording of the requirement. We followed the pitch playbook, which
  says both files must be at the repo root.
- **Suggested fix:** Publish a sponsor page with the requirement and an
  example `friction.md`.

## Hackathon log

Team: append entries below as you hit them. Newest last.

<!-- Add entries here. Keep the template above. -->
