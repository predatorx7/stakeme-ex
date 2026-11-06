# 03: Adapters

Summary reconstructed from the repository. Sources: `CONTEXT.md`
("Scope update", "Adapter map") and `docs/architecture-adapters.md`.

## Direction

Keep sponsor integrations behind small interfaces so app logic does not depend
on a vendor. Quoted from `CONTEXT.md`:

> Adapter pattern so omitted sponsors drop in later without touching app logic

## Interfaces named in the decision log

- `IStorageProvider`: default `ZeroGravityStorage` (0G Storage). L-ISA terms and
  audit logs go through it.
- `IOracle`: fetches and verifies Reclaim proofs; implemented by
  `ZeroGravityAgent`, which also runs the 0G audit.
- `PaymentService` with a payment rail: default `HederaPaymentRail`. After the
  second scope update the rail interface is `IPaymentRail`.

After scope update 2, "Adapters stay generic (`IStorageProvider`, `IOracle`,
`IPaymentRail`) with only the three-sponsor implementations."

## Reclaim client switch

The decision log also records a switch to Builder's `@reclaimprotocol/client`
with a provider built through the Reclaim MCP server (workstream 8), and a mock
bank page that stands in for a real bank.

## Other integration decisions (summarized)

- World ID v4: the server signs the request and verifies the proof.
- 0G Storage uploads run from a background outbox so chain jobs never wait.
- Dividends use an x402-style flow where the creator signs a Hedera transfer.

Details live in `docs/architecture-adapters.md` and `docs/integrations/`.
