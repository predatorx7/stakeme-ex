# Pitch and demo playbook

Tagline: *StakeMe Exchange (SMX): the world's first liquid stock market for
human potential.*

## Elevator pitch

Day traders speculate on dead corporations while banks refuse to lend to
brilliant young talent. SMX lets ambitious creators and professionals IPO their
future income with a liquid income share agreement (L-ISA). Investors fund
them today and receive cryptographically enforced dividends from real-world
income. Hold the token for yield or trade it on life events.

An L-ISA pledges a percentage of income (for example, 5%) for a fixed term
(for example, 5 years) with no dollar cap.

## User journeys

Example: $10,000 raise, $500 creator stake, 5% income share for 5 years.

### Happy path: Ravi, the honest developer

1. IPO: Ravi verifies with World ID, stakes $500 USDC, and signs the L-ISA
   (terms stored on Arkiv).
2. Raise: investors fund $10,000; 10,000 `$RAVI` tokens are minted. Ravi gets
   tranche 1 ($2,000); $8,000 stays in escrow.
3. Proof: in month 3 Ravi proves a $5,000 bank deposit with Reclaim zkTLS.
4. Audit: Chainlink CRE carries the proof; the 0G agent checks it against the
   Arkiv terms and computes a $250 dividend.
5. Payout: Ravi pays $250; the agent unlocks tranche 2 ($4,000); Hedera x402
   streams $250 to `$RAVI` holders.
6. Market: traders buy `$RAVI`; price rises.

### Sad path: Rahul, the scammer

1. World ID blocks fake accounts. Rahul raises $10,000, takes tranche 1
   ($2,000), and disappears.
2. Month 3: no Reclaim proof. The agent starts a 14-day grace period.
3. Liquidation: $8,000 escrow refunded, $500 stake slashed to investors,
   World ID nullifier blacklisted, Arkiv contract referred to a debt
   collector (off-chain, narrative only).

## Three-minute stage pitch

1. **0:00–0:30 Hook.** Problem above. "Welcome to StakeMe Exchange."
2. **0:30–1:15 Self-IPO.** Mint `$MUSH` on Hedera. Verify with World ID.
   Stake $500.
3. **1:15–2:00 Stack.** Escrow; Reclaim proof of bank deposit; 0G agent via
   Chainlink CRE audits against Arkiv terms; unlock tranche; Hedera x402
   streams the dividend.
4. **2:00–2:30 Scam protection.** Default → refund, slash, blacklist.
5. **2:30–3:00 Close.** Hold or trade `$MUSH`. Scan the QR code. 5% of any
   prize streams to holders.

## Demo setup with no spend

1. Reclaim: `/mock-bank` page with a hardcoded $5,000 deposit; Reclaim
   developer free plan.
2. World ID: Simulator in the Developer Portal (staging app).
3. Hedera: testnet faucet.
4. 0G: Galileo testnet faucet; show `chainscan-galileo.0g.ai`.
5. Chainlink: CRE simulator / Sepolia.
6. Arkiv: testnet. Keep `/arkiv/schema.md` and `/arkiv/friction.md` at repo
   root (prize requirement).
7. Arc: testnet paymaster RPC.

## Sponsor questions for booth visits

- **0G:** Which 0G Storage telemetry logs do judges want for our "safe-stop"
  fallback (escrow freeze when proofs stop)?
- **Hedera:** For x402 micro-dividends to many holders, do you recommend a
  lock-and-mint bridge to an EVM testnet for a Uniswap pool?
- **World ID:** Can we query contract state before the IDKit modal opens to
  block blacklisted nullifiers?
- **Chainlink CRE:** Pass large proof JSON through CRE, or verify in CRE and
  forward only a boolean?
