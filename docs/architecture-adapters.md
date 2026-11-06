# Adapter architecture

Routes and workers depend on three small interfaces. Sponsor SDKs live behind
them in `packages/app/src/services/`. A new backend (another storage network,
oracle, or payment rail) is one class plus one line in a factory; no route,
worker, or SQL changes.

```mermaid
classDiagram
    class IStorageProvider {
        <<interface>>
        +name string
        +putJson(input) ref, contentHash
        +getJson(ref)* unknown
    }
    class ZeroGravityStorage {
        +putJson(input)
    }
    class LocalStorageProvider {
        +putJson(input)
        +getJson(ref)
    }
    class FallbackStorage {
        +putJson(input)
    }
    class IOracle {
        <<interface>>
        +name string
        +createProofRequest(input) ReclaimSession
        +fetchVerifiedIncome(payload) VerifiedIncome
        +getProofRequestStatus(sessionId)
    }
    class ZeroGravityAgent {
        +audit(input) IncomeAudit
    }
    class OracleDecorator {
        <<abstract>>
    }
    class IPaymentRail {
        <<interface>>
        +name string
        +payout(splits, ctx) DividendStreamResult
        +createPaymentRequest(dividend, splits)*
        +settle(dividend, payload)*
    }
    class HederaPaymentRail
    class SimulatedPaymentRail
    class PaymentService {
        +payDividend(dividend)
        +createPaymentRequest(dividend)
        +settle(dividend, payload)
    }
    IStorageProvider <|.. ZeroGravityStorage
    IStorageProvider <|.. LocalStorageProvider
    IStorageProvider <|.. FallbackStorage
    FallbackStorage o-- IStorageProvider : primary and fallback
    IOracle <|.. ZeroGravityAgent
    IOracle <|.. OracleDecorator
    OracleDecorator o-- IOracle : wraps
    ZeroGravityAgent --> IStorageProvider : writes audit logs
    IPaymentRail <|.. HederaPaymentRail
    IPaymentRail <|.. SimulatedPaymentRail
    PaymentService --> IPaymentRail : pays over
```

`*` marks optional members.

## Defaults and switches

| Interface | Factory | Default | Switch |
| --- | --- | --- | --- |
| `IStorageProvider` | `createStorageProvider()` in `services/storage/index.ts` | `ZeroGravityStorage` wrapped in `FallbackStorage` | `STORAGE_PROVIDER=0g\|local`. Without `ZG_PRIVATE_KEY` the factory returns `LocalStorageProvider` (`local:<sha256>` refs). |
| `IOracle` | `createOracle()` in `services/oracle/index.ts` | `ZeroGravityAgent` | Wrap it in an `OracleDecorator` subclass in the factory. |
| `IPaymentRail` | `createPaymentService(pg)` in `services/payment/index.ts` | `HederaPaymentRail` (simulated without keys) | Return another rail from `createPaymentRail()`. |

## Where each piece is used

```mermaid
flowchart LR
    launch["LaunchIpo route"] -->|storeTerms| storage["IStorageProvider"]
    cb["ReclaimCallback and AuditMilestone"] --> pipeline["utils/income-audit.ts"]
    pipeline -->|fetchVerifiedIncome| oracle["IOracle: ZeroGravityAgent"]
    pipeline -->|audit| oracle
    oracle -->|audit log| storage
    pay["PayDividend and worker"] --> svc["PaymentService"]
    svc --> rail["IPaymentRail"]
    pipeline -->|"SQL: audit_income_proof"| db[("Postgres")]
    launch -->|"SQL: launch_ipo"| db
    svc -->|"SQL: stream_receipts"| db
```

- `LaunchIpo` writes the L-ISA legal terms (share bps, term, raise, stake,
  tranches, hashed nullifier) with `storeTerms(createStorageProvider(), ...)`.
  The ref lands in `creators.terms_ref`.
- The income pipeline asks the oracle for `VerifiedIncome`, then
  `ZeroGravityAgent.audit()` runs the model on 0G Compute and writes the
  approve or deny log. The ref lands in `income_proofs.audit_log_ref`. SQL
  decides the outcome.
- `PaymentService` never computes amounts. Splits come from SQL
  (`dividend_splits_json`, `pro_rata_split`) and are checked to add up. It
  records the receipts through SQL.

## Add a new implementation

1. Implement the interface in `services/<area>/`.
2. Return it from the factory (and add an env switch if it should be
   selectable).
3. Keep SDK imports inside the class so nothing else depends on them.

## Reclaim flow

```mermaid
sequenceDiagram
    participant B as "Browser"
    participant API as "SMX API"
    participant R as "Reclaim Builder"
    participant DB as "Postgres"
    B->>API: "POST /creators/{ticker}/reclaim-sessions"
    API->>R: "sessions.create (provider, context)"
    R-->>API: "id, verificationUrl, orgId"
    API->>DB: "insert reclaim_sessions (PENDING)"
    API-->>B: "sessionId, requestUrl, statusUrl"
    B->>R: "open verificationUrl, prove the deposit"
    R->>API: "POST /reclaim/callback"
    API->>DB: "load session by sessionId"
    API->>R: "results.receive (verify JWS and proofs)"
    API->>DB: "submit_income_proof, audit_income_proof"
    B->>API: "GET /reclaim/sessions/{id} (fallback to SSE)"
```

Environment: `RECLAIM_ORG_SECRET`, `RECLAIM_PROVIDER_ID`, and optionally
`RECLAIM_ORG_ETH_PRIVATE_KEY` (only when the org encrypts results). A
`ResultVerificationError` with `retryable` set returns `503` so Reclaim
retries; every other outcome returns `200`.
