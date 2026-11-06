# Prize checklist: ETHGlobal Mumbai

This page maps StakeMe Exchange (SMX) to the Hedera, World, and 0G prize tracks
at ETHGlobal Mumbai, lists what each track requires, and shows what is still
missing. Status values are **Met**, **Partly**, and **Not met**.

Sources (fetched 2026-11-06, the day the event started):

- Event: [ETHGlobal Mumbai](https://ethglobal.com/events/mumbai), November 5-7,
  2026, Mumbai, India.
- Prizes: [all sponsors](https://ethglobal.com/events/mumbai/prizes),
  [Hedera](https://ethglobal.com/events/mumbai/prizes/hedera),
  [World](https://ethglobal.com/events/mumbai/prizes/world),
  [0G](https://ethglobal.com/events/mumbai/prizes/0g).
- Rules: [Rules, project submission and judging](https://ethglobal.com/events/mumbai/info/details).

The event page exists, so no other event is used as a stand-in. Quotes below are
short excerpts; the linked pages are authoritative and can change.

## Summary

You can pick up to 3 partner prizes, and several tracks from one partner count
as one prize. SMX uses exactly three sponsors, so it fits.

| Sponsor | Best-fit track | Prize | Fit today | Biggest blocker |
| --- | --- | --- | --- | --- |
| Hedera | Tokenize Anything with Hedera Studios | $5,000 | Partly | ATS equity token is simulated and never ran live |
| Hedera | AI Agents That Pay: x402 on Hedera | $6,500 | Not met | No x402-protected endpoint or paying agent |
| World | Best Use of IDKit | $2,500 (2 x $1,250) | Partly | No debrief, no trust-moment write-up |
| World | World ID Agent Pass | $5,000 | Not met | SMX uses IDKit proof of human, not Agent Pass |
| 0G | Build with 0G Private Computer | $5,000 | Partly | Router audit is the approval gate and shows request IDs; hosted demo link and video still missing |

Tracks that SMX cannot or should not enter: Hedera "No Solidity Allowed" (SMX
uses Solidity contracts), all Continuity Track prizes (SMX is a classic-track
project), 0G Physical AI (no hardware or decision loop), and 0G Agents That Pay
for Themselves (no self-funding agent).

## General submission requirements

From [Rules, project submission and judging](https://ethglobal.com/events/mumbai/info/details)
and the 0G submission list.

| Requirement | Quote or rule | Status | Evidence and action |
| --- | --- | --- | --- |
| Deadline | "Submit by Saturday, November 7, 2026, at 9:00 am IST. Late submissions won't be accepted." | At risk | The event is under way. Plan the submission first. |
| Title, description, repo link | Hacker Dashboard form: title, description, "a link to your repository" | Partly | `README.md` has a description. Remote is `origin` `git@github.com:predatorx7/stakeme-ex.git`; confirm it is public (0G and Hedera require a public repo). |
| Version-control history | "large single commits or missing histories may be disqualified" | Partly | 17 commits, all dated 2026-11-06. Commit in small steps from now on. |
| Work started after the hackathon began (classic track) | "all work on your project must begin after the hackathon officially starts" | Met, unverified | All commits are 2026-11-06. State this in the README. |
| Demo video | "Must be between 2 and 4 minutes", at least 720p, not sped up, not phone-recorded, no AI voiceover, at most 4 bullets per slide | Not met | No video exists. 0G asks for "under 3 mins"; record one 2:30 to 3:00 video that also satisfies the 5-minute Hedera limit. |
| Live demo link | 0G: "Demo video (under 3 mins) and a live demo link" | Not met | App runs on `localhost:4020`. The Reclaim mock bank uses a temporary cloudflared tunnel (see `CONTEXT.md`, Workstream 8). Deploy the app and the mock bank to a stable host. |
| Contract addresses | 0G: "Contract deployment addresses" | Met | `packages/contracts/deployments/hedera-testnet.json`: `LiquidISAFactory` `0xbbc4d97315cd6e3f809d39ec4d0b2638894bc07e`, `MockUSDC` `0x1352D7F21514d6c68f8B901E7cC2AE3f1A78618f`, `LiquidISA` implementation `0xb2a511d967202950e3b259c7420de1a7729a2f15`, `CreatorShareToken` implementation `0x8e483e26b05ee86f414a4f502457ee8fa3f05071`. Add HashScan links to the README. |
| Team names and contact | 0G: "Team member names and contact info (Telegram and X)" | Not met | Not in the repo. Add to the submission form. |
| Partner prize selection | "Select up to 3 Partner Prizes" | Met | Choose Hedera, World, 0G. |
| AI-use disclosure | "Document where and how AI tools were used"; "include all spec files, prompts, and planning artifacts in your submission repository" | Not met | `docs/product-spec.md` and `AGENTS.md` exist, but there is no disclosure section. Add an "AI use" section to `README.md` and commit the planning artifacts. |
| Judging mode | Finalist (4 min demo, 3 min Q&A) or partner-only | Open | Decide. Finalist needs a rehearsed 4-minute live demo. |

## Hedera

### Track: Tokenize Anything with Hedera Studios ($5,000)

Prizes: 1st $2,500, 2nd $1,500, 3rd $1,000. This is the best Hedera fit because
SMX issues a creator equity token with a lifecycle (tranches, dividends,
freeze, liquidation).

| Requirement | Status | Evidence |
| --- | --- | --- |
| "Use Asset Tokenization Studio or Stablecoin Studio to issue or manage a tokenized asset or stablecoin." | Partly | `packages/app/src/integrations/hedera-ats.ts` calls ATS `Factory.deployEquity` and `Equity.mint` with viem. README: "Hedera ATS equity token: Simulated. The code is written but never ran against a live ATS deployment." The ATS token only mirrors the cap table; `CreatorShareToken` is the source of truth (`CONTEXT.md`, Scope update 2). |
| "Deploy and demo on Hedera testnet" | Partly | Own contracts are live on chain 296 (addresses above). The ATS factory and resolver are not deployed (`ATS_ENABLED`, `ATS_FACTORY_ADDRESS`, `ATS_RESOLVER_ADDRESS` unset; `CONTEXT.md`, Remaining). |
| "with contracts verified on HashScan where applicable" | Not met | No verification step is recorded in `docs/contracts.md` or `CONTEXT.md`. |
| Public repo and demo video of 5 minutes or less "covering issuance, configuration, and at least one lifecycle operation" | Partly | Lifecycle (tranche unlock, freeze, liquidation) ran against a local Hardhat node and the Hedera clone deploy. Video not recorded. |

Extra points listed on the page that SMX already has: compliance freezes
(`freezeEscrow`/`unfreezeEscrow`), and dividend distributions.

Actions, by impact:

1. Deploy the ATS factory and resolver to Hedera testnet, set `ATS_ENABLED=1`,
   and run one real IPO so `atsTokenAddress` is a real HTS-backed token. Link it
   on HashScan in the demo.
2. Verify `LiquidISAFactory`, the `LiquidISA` implementation, and
   `CreatorShareToken` on HashScan (Sourcify) and add the links to `README.md`.
3. If ATS deployment is not feasible in time, say plainly in the video that ATS
   is a mirror and show the live `createISA` transaction on HashScan; expect a
   weak score on this track.

### Track: AI Agents That Pay: x402 on Hedera ($6,500)

Prizes: 1st $3,000, 2nd $2,000, 3rd $1,500. SMX builds x402 payment
requirements but is the payer, not a paid service.

| Requirement | Status | Evidence |
| --- | --- | --- |
| "Deploy at least one x402-protected endpoint that settles on Hedera testnet or mainnet, via a listed facilitator or your own." | Not met | `docs/integrations/hedera.md`: "The dividend loop doesn't call the facilitator." `HederaPaymentRail.createPaymentRequest` returns requirements, but no endpoint answers HTTP 402. |
| "Have an agent or client find the endpoint and complete at least one paid request with no human approving." | Not met | The creator signs the dividend transfer in the browser (a human approval). |
| Public repo README "covers setup, architecture, and the payment flow, including a Hedera transaction ID" | Partly | README covers the flow; no settled live transaction ID. The x402 payout is "Simulated unless you set the Hedera operator keys." |
| Demo video of 5 minutes or less "showing a settled payment linked on HashScan" | Not met | No live settlement has been run. |

Actions: only pursue this track if time remains after the three items above.
The cheapest qualifying addition is a small x402-gated endpoint (for example,
the 0G audit report) that the 0G agent pays through Blocky402 or a self-hosted
facilitator on `hedera:testnet`, then a settled HashScan transaction in the
README. Do not claim this track on the current dividend flow alone.

### Other Hedera tracks

- "No Solidity Allowed" ($2,000): not eligible. It requires "no Solidity smart
  contracts"; SMX deploys `LiquidISA` and the factory.
- Built on Hedera (Continuity Track): not eligible; SMX started at this event.

## World

### Track: Best Use of IDKit ($2,500)

Up to 2 teams receive $1,250 each. This is the World track SMX can qualify for.

| Requirement | Status | Evidence |
| --- | --- | --- |
| "Integrate IDKit in a working app, mini app, or onchain flow." | Met | `@worldcoin/idkit-core` 4.6.0 in the browser (`packages/app/src/client/world-id.ts`); the Launch flow requests a proof of human. App `app_0b5a20d804cb26e5008896d976fc4193`, RP `rp_6a0a12bcfbc0fbf0` (staging). |
| "Use at least one supported World ID credential, verified on the server or onchain." | Met | `POST /api/rp-signature` signs on the server; `POST /api/world-id/check` verifies with `POST https://developer.world.org/api/v4/verify/{rp_id}`. Verified end to end with the World ID Simulator (`CONTEXT.md`, Live testnet status). Nullifier also stored on the factory (`isaOfNullifier`). |
| "Explain the trust moment and why that credential is the minimum sufficient assurance." | Partly | `docs/integrations/world-id.md` explains the nullifier and double-IPO block. No write-up in judge-facing form (README or submission). |
| "Demonstrate a successful verification and one alternative path (e.g., cancellation or rejection)." | Partly | The "Simulate Sybil" path repeats a nullifier and is rejected, but it runs only under `DEMO_MODE=1` with fixtures. No recorded cancel path through real IDKit. |
| "Submit the same integration debrief" (time to first success, friction, missing docs, top improvement) | Not met | No feedback document in the repo. |
| Server-side validation only | Met | The server verifies; the browser never signs. |

Actions, by impact:

1. Write the integration debrief (time to first success, friction, missing
   docs, top improvement). Source material: the `@worldcoin/idkit` (React-only)
   versus `@worldcoin/idkit-core` choice and the v4 RP-signature flow in
   `docs/integrations/world-id.md`. Add it as `docs/world-debrief.md`.
2. Add a 3-sentence "trust moment" section to `README.md`: a stake-backed
   income securities issuer must be one human, so proof of human at the
   Orb or device level is the minimum assurance.
3. Record both paths in the video using the real IDKit flow: success, then
   cancel (close the IDKit dialog) and a repeat-nullifier rejection against the
   real verify API, not fixtures.

### Track: World ID Agent Pass ($5,000)

| Requirement | Status |
| --- | --- |
| "Integrate the official World ID Agent Pass." | Not met. The docs and code use IDKit v4 proof of human only; Agent Pass is not mentioned in `docs/integrations/world-id.md`. |
| Full journey, denied path, secure backend validation, debrief | Partly. Backend validation and journey exist; they are bound to IDKit, not Agent Pass. |

Action: only enter if the 0G auditor agent can be given an Agent Pass check
(for example, the agent proves it acts for a verified creator before approving
a proof). Otherwise skip; Best Use of IDKit already counts as the World prize.

## 0G

0G pays "at 0G's discretion". All four tracks share the submission list in
[General submission requirements](#general-submission-requirements).

### Track: Build with 0G Private Computer ($5,000)

Prizes: 1st $2,500, 2nd $1,500, 3rd $1,000. Bonus: iAI sign-in.

| Requirement | Status | Evidence |
| --- | --- | --- |
| "Build a consumer app where AI on 0G is the core product." | Partly | The 0G auditor agent decides every tranche release and dividend. SMX is a finance app with an AI audit step; judges may see it as secondary. |
| "Show inference on 0G Private Computer in the main user flow, with request IDs." | Met | Every income proof audit calls the 0G Router (`0GM-1.0-35B-A3B`, falling back to `glm-5.3`, trust mode `private`, `verify_tee: true`). The proof row shows "Audited by 0G Private Computer", the model, the short request ID with copy, and the 0G Storage log link; the same fields are in the audit log on 0G Storage. The Router returned no `tee_verified` field in our live calls, so "TEE verified" is shown only when it is `true`, and the UI otherwise says "Private routing (TEE provider)". See `docs/integrations/zero-g.md`. |
| "Provide a working app a judge can try, with a clear reason to return tomorrow." | Partly | App runs locally; no hosted link. |
| "Explain in one sentence what breaks if 0G is removed." | Met | "Without 0G Private Computer, no AI auditor signs off on the income proof, so no tranche is released and no dividend is created." If the Router call fails the proof stays PENDING with "0G audit unavailable, retry"; the rules engine only runs behind `ZG_ALLOW_RULES_FALLBACK=1` and is labelled "Fallback: rules engine (0G unavailable)". |
| 0G Storage use (not required, strengthens the case) | Met | Live on Galileo: uploads of L-ISA terms and audit logs work (about 0.0012 0G each); outbox worker in `packages/app/src/worker/storage-uploads.ts`; root hash shown as `termsStorage` / `auditLogStorage`. |
| Bonus: iAI sign-in | Not met | Not implemented. |

Actions, by impact:

1. Done: 0G Private Computer runs through the Router and returns a request ID,
   stored in the audit log next to the storage root hash.
2. Done: the request ID, model, TEE status and storage log link show on every
   audited proof. Show them in the demo video and keep the credit readout on
   the Hub in frame so the balance visibly goes down.
3. Done: the rules-engine fallback is off by default and labelled in the UI when
   enabled.
4. Add the live demo link and Telegram/X contacts.

### Track: Physical AI ($5,000)

Not eligible. It requires "A robot, drone, wearable, or device" and states
"A fallback that fakes the decision disqualifies the project." The rules-engine
fallback would count against SMX here.

### Track: Agents That Pay for Themselves ($2,000)

Not met. It requires an agent that "earns money and uses it to pay for its own
0G Compute inference, without human top-ups", with a spend cap. SMX funds the
0G account manually from a faucet key. A small version is possible: route a
fraction of the fee from the Hedera dividend loop into the 0G ledger, with a
spend cap, but this is out of reach before the deadline.

### Track: Keep Building on 0G (Continuity)

Not eligible. It is for Continuity Track projects.

## Top actions across all sponsors

Ordered by impact on qualification.

1. Deploy a hosted app and a stable mock-bank host, and record the 2:30 to 3:00
   video. Without them, no track qualifies.
2. Enable 0G Private Computer with request IDs (0G qualification).
3. Run the ATS equity token live on Hedera testnet and verify contracts on
   HashScan (Hedera qualification).
4. Write the World integration debrief and trust-moment explanation, and record
   the cancel path (World qualification).
5. Add the AI-use disclosure, team contacts, and commit history hygiene
   (general eligibility).
