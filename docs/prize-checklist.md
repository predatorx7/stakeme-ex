# Prize checklist: ETHGlobal Mumbai

This page maps StakeMe Exchange (SMX) to the Hedera, World, and 0G prize tracks
at ETHGlobal Mumbai, lists what each track requires, and shows what is still
missing. Status values are Met, Partly, and Not met.

Sources (fetched 2026-11-06, the day the event started):

- Event: [ETHGlobal Mumbai](https://ethglobal.com/events/mumbai), November 5-7,
  2026, Mumbai, India.
- Prizes: [all sponsors](https://ethglobal.com/events/mumbai/prizes),
  [Hedera](https://ethglobal.com/events/mumbai/prizes/hedera),
  [World](https://ethglobal.com/events/mumbai/prizes/world),
  [0G](https://ethglobal.com/events/mumbai/prizes/0g).
- Rules: [Rules, project submission and judging](https://ethglobal.com/events/mumbai/info/details).

Quotes below are short excerpts. The linked pages are authoritative and can
change.

## Summary

You can pick up to 3 partner prizes, and several tracks from one partner count
as one prize. SMX enters exactly three sponsors (Hedera, World, 0G), so it fits the limit of 3 partner prizes.

| Sponsor | Best-fit track | Prize | Fit today | Biggest blocker |
| --- | --- | --- | --- | --- |
| Hedera | Tokenize Anything with Hedera Studios | $5,000 | Partly | One real ATS equity token minted on testnet (`$MUSH`); it mirrors the cap table, and new live mints currently revert and fall back to simulated; contracts verified; video pending |
| Hedera | AI Agents That Pay: x402 on Hedera | $6,500 | Partly | Paid endpoint and agent met with tx links; recorded run was on a local instance, public-site rerun pending; video pending |
| World | Best Use of IDKit | $2,500 (2 x $1,250) | Met | Debrief written (`docs/world-id-debrief.md`, about 8 minutes to first success); video pending |
| World | World ID Agent Pass | $5,000 | Not met | SMX uses IDKit proof of human, not Agent Pass |
| 0G | Build with 0G Private Computer | $5,000 | Partly | Router audit and request IDs met; hosted link answers 200 after the redeploy; demo video pending, iAI bonus not claimed |

Tracks that SMX cannot or should not enter: Hedera "No Solidity Allowed" (SMX
uses Solidity contracts), all Continuity Track prizes (SMX is a classic-track
project), 0G Physical AI (no hardware or decision loop), and 0G Agents That Pay
for Themselves (no self-funding agent).

## General submission requirements

From [Rules, project submission and judging](https://ethglobal.com/events/mumbai/info/details)
and the 0G submission list.

| Requirement | Quote or rule | Status | Evidence and action |
| --- | --- | --- | --- |
| Deadline | "Submit by Saturday, November 7, 2026, at 9:00 am IST. Late submissions won't be accepted." | At risk | Submission is due today, 09:00 IST. Remaining: demo video, public-site x402 rerun. |
| Title, description, repo link | Hacker Dashboard form: title, description, "a link to your repository" | Partly | `README.md` has a description. Remote is `origin` `git@github.com:predatorx7/stakeme-ex.git`; confirm it is public before submitting (0G and Hedera require a public repo). |
| Version-control history | "large single commits or missing histories may be disqualified" | Met | 60 commits (`git rev-list --count HEAD`): 30 dated 2026-11-06, 30 dated 2026-11-07. Several commits are large: the 64-file bootstrap (23,298 insertions), the 151-file backend commit (15,843 insertions), and three later commits of 5,600 to 19,100 insertions. The rest are small steps. |
| Work started after the hackathon began (classic track) | "all work on your project must begin after the hackathon officially starts" | Met | Hacking started on 5 November 2026 (developer's statement). The first commit is 2026-11-06 16:38 IST, inside the event window. |
| Demo video | "Must be between 2 and 4 minutes", at least 720p, not sped up, not phone-recorded, no AI voiceover, at most 4 bullets per slide | Not met | Video pending (plan in `docs/demo-video.md`). 0G asks for "under 3 mins"; record one 2:30 to 3:00 video that also satisfies the 5-minute Hedera limit. |
| Live demo link | 0G: "Demo video (under 3 mins) and a live demo link" | Partly | https://stakeme.magnificlabs.org/ . Earlier checks: `/creators` and `/creators/MUSH` returned 200 (MUSH shows "Audited by 0G Private Computer"), `/creators/MUSH/audit-report` returned 402 unpaid, and the mock bank is served at `/mock-bank`. After the 2026-11-07 redeploy and reseed (every URL answered 502 during it), `/`, `/creators`, `/creators/MUSH`, `/activity`, `/healthz` and `/mock-bank/login` returned 200. Re-check the URLs before submitting. Deploy files are committed (`docs/deployment.md`). |
| Contract addresses | 0G: "Contract deployment addresses" | Met | `packages/contracts/deployments/hedera-testnet.json`: `LiquidISAFactory` `0xc6b7af9392538bc596caed4a5758b9d92f650e59`, `MockUSDC` `0x40027d9375311fa44b95ef881a92374b1dbf8ec4`, `LiquidISA` implementation `0x3f61050ad9fb221992742f10b34237b06a97e361`, `CreatorShareToken` implementation `0x81521abe9ddc7dc792b4c6f4262a48bc744426ff`, `CreatorPool` implementation `0xe310d76b357be72439e78fff84a82fe486fba84b`. Verified on Sourcify (exact runtime match). ATS token `$MUSH`: `0xe3abC950d9daf866653931a314FF3F19E5276AFb`. |
| Team names and contact | 0G: "Team member names and contact info (Telegram and X)" | Met | Solo builder Mushaheed Syed; X [@_predatorx7](https://x.com/_predatorx7), Telegram [@mushaheedx](https://t.me/mushaheedx), both listed in the README. |
| Open-source license | Public repo with a license (0G and Hedera require a public repo) | Met | MIT `LICENSE` at the repo root, `"license": "MIT"` in every `package.json`, and a License line in the README. |
| Partner prize selection | "Select up to 3 Partner Prizes" | Met | Choose Hedera, World, 0G. |
| AI-use disclosure | "Document where and how AI tools were used"; "include all spec files, prompts, and planning artifacts in your submission repository" | Met | `docs/ai-usage.md` discloses AI use; verbatim prompts are in `docs/prompts/session-user-prompts.md`; spec and planning files are committed. A reuse disclosure is in `docs/reuse.md` (Met). |
| Judging mode | Finalist (4 min demo, 3 min Q&A) or partner-only | Open | Decide. Finalist needs a rehearsed 4-minute live demo. |

## Hedera

### Track: Tokenize Anything with Hedera Studios ($5,000)

Prizes: 1st $2,500, 2nd $1,500, 3rd $1,000. This is the best Hedera fit because
SMX issues a creator equity token with a lifecycle (tranches, dividends,
freeze, liquidation).

| Requirement | Status | Evidence |
| --- | --- | --- |
| "Use Asset Tokenization Studio or Stablecoin Studio to issue or manage a tokenized asset or stablecoin." | Met | With `ATS_MODE=live`, `packages/app/src/integrations/hedera-ats.ts` calls the public ATS testnet Factory (`deployEquity`, then `mint`) with viem. `$MUSH` is [`0xe3abC950d9daf866653931a314FF3F19E5276AFb`](https://hashscan.io/testnet/contract/0xe3abC950d9daf866653931a314FF3F19E5276AFb) (about 0.23 HBAR). Honest limits: one real ATS token minted; the default mode is simulated, new live mints currently revert (custom error `0x76f138fb`) and fall back to a simulated token, and the ATS token mirrors the cap table while `CreatorShareToken` is the source of truth. |
| "Deploy and demo on Hedera testnet" | Met | Own contracts are live on chain 296 (addresses above), the ATS equity token is live, and dividends are USDC (creator signs `distributeDividend`, holders `claim()`). The earlier live HBAR dividend ([`0.0.11340822@1793996054.174485762`](https://hashscan.io/testnet/transaction/0.0.11340822@1793996054.174485762)) is historical evidence of the legacy HBAR rail; No USDC dividend transaction is listed here yet. |
| "with contracts verified on HashScan where applicable" | Met | All five contracts are verified on Sourcify (exact runtime match), which HashScan displays; factory `0xc6b7af9392538bc596caed4a5758b9d92f650e59`. |
| Public repo and demo video of 5 minutes or less "covering issuance, configuration, and at least one lifecycle operation" | Partly | Lifecycle (tranche release, freeze, liquidation, dividend) ran on Hedera testnet and a local Hardhat node. Video pending. |

Extra points listed on the page that SMX already has: compliance freezes
(`freezeEscrow`/`unfreezeEscrow`), and dividend distributions.

Actions, by impact:

1. Show the `$MUSH` ATS token on HashScan in the video, then a USDC
   `distributeDividend` and `claim()` transaction.
2. Say plainly that the ATS token mirrors the cap table, and that new live ATS
   mints currently revert and fall back to a simulated token.
3. Done: contracts verified on Sourcify and linked in `README.md`.

### Track: AI Agents That Pay: x402 on Hedera ($6,500)

Prizes: 1st $3,000, 2nd $2,000, 3rd $1,500. SMX serves one paid x402
endpoint (the audit report) and runs a research agent that pays for it.

| Requirement | Status | Evidence |
| --- | --- | --- |
| "Deploy at least one x402-protected endpoint that settles on Hedera testnet or mainnet, via a listed facilitator or your own." | Met | `GET /creators/{ticker}/audit-report` (0.1 HBAR, the one place the platform earns revenue today) answers 402 unpaid on the public site and settles via the `x402.org` facilitator. See `docs/x402-agent.md`. |
| "Have an agent or client find the endpoint and complete at least one paid request with no human approving." | Met | `packages/app/scripts/x402-research-agent.ts` paid three audit reports (CHEF, LOFI, MUSH) with spend controls and no human approval; links in `docs/x402-agent.md`. The run used a local instance; a public-site rerun is pending. |
| Public repo README "covers setup, architecture, and the payment flow, including a Hedera transaction ID" | Met | Settled Hedera testnet transaction IDs are in `docs/x402-agent.md` and `CONTEXT.md`. Public-site rerun pending. |
| Demo video of 5 minutes or less "showing a settled payment linked on HashScan" | Partly | Settled payments are linked on HashScan in `docs/x402-agent.md`; video pending. |

Actions: rerun the research agent against the public site and record the
transactions; show a settled HashScan payment in the video.

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
| "Use at least one supported World ID credential, verified on the server or onchain." | Met | `POST /api/rp-signature` signs on the server; `POST /api/world-id/check` verifies with `POST https://developer.world.org/api/v4/verify/{rp_id}`. Verified end to end with the World ID Simulator (`CONTEXT.md`, Live status). Nullifier also stored on the factory (`isaOfNullifier`). |
| "Explain the trust moment and why that credential is the minimum sufficient assurance." | Met | `docs/world-id-debrief.md` and `docs/integrations/world-id.md` explain the trust moment, the nullifier and the double-IPO block. |
| "Demonstrate a successful verification and one alternative path (e.g., cancellation or rejection)." | Partly | `src/client/world-id.ts` handles cancel, decline and timeout, and `POST /api/world-id/check` rejects a used or blacklisted nullifier (`409`, `403`); the debrief has the path table. The "Simulate Sybil" button runs only under `DEMO_MODE=1` with fixtures. No recording of the cancel path through real IDKit yet. |
| "Submit the same integration debrief" (time to first success, friction, missing docs, top improvement) | Met | `docs/world-id-debrief.md`: measured time to first success about 8 minutes, friction, missing docs, top improvement. |
| Server-side validation only | Met | The server verifies; the browser never signs. |

Actions, by impact:

1. Done: the integration debrief is `docs/world-id-debrief.md`.
2. Add a 3-sentence "trust moment" section to `README.md` (the README has none
   yet): a stake-backed income securities issuer must be one human, so proof of
   human at the Orb or device level is the minimum assurance.
3. Record both paths in the video using the real IDKit flow: success, then
   cancel (close the IDKit dialog) and a repeat-nullifier rejection against the
   real verify API, not fixtures.

### Track: World ID Agent Pass ($5,000)

| Requirement | Status |
| --- | --- |
| "Integrate the official World ID Agent Pass." | Not met. The docs and code use IDKit v4 proof of human only; `docs/integrations/world-id.md` names it only as not met. |
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
| "Provide a working app a judge can try, with a clear reason to return tomorrow." | Partly | Hosted at https://stakeme.magnificlabs.org/ ; see the live demo link row for the current redeploy. |
| "Explain in one sentence what breaks if 0G is removed." | Met | "Without 0G Private Computer, no AI auditor signs off on the income proof, so no tranche is released and no dividend is created." If the Router call fails the proof stays PENDING with "0G audit unavailable, retry"; the rules engine only runs behind `ZG_ALLOW_RULES_FALLBACK=1` and is labelled "Fallback: rules engine (0G unavailable)". |
| 0G Storage use (not required, strengthens the case) | Met | Live on Galileo: uploads of L-ISA terms and audit logs work (about 0.0012 0G each); outbox worker in `packages/app/src/worker/storage-uploads.ts`; root hash shown as `termsStorage` / `auditLogStorage`. |
| Bonus: iAI sign-in | Not met | iAI sign-in bonus not claimed. |

Actions, by impact:

1. Done: 0G Private Computer runs through the Router and returns a request ID,
   stored in the audit log next to the storage root hash.
2. Done: the request ID, model, TEE status and storage log link show on every
   audited proof. Show them in the demo video and keep the credit readout on
   the Hub in frame (Router credits: $11).
3. Done: the rules-engine fallback is off by default and labelled in the UI when
   enabled.
4. Live demo link: hosted at https://stakeme.magnificlabs.org/ ; confirm it is back after the redeploy.

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

Done: hosted app, 0G request IDs, Sourcify verification, one real ATS mint,
USDC dividends and claims, onchain trading, World debrief, AI disclosure, commit
history. Remaining:

1. Finish the production redeploy and confirm the site answers 200 again.
2. Record the 2:30 to 3:00 demo video, including the World cancel path.
3. Rerun the x402 research agent against the public site and record the
   transactions.
4. Add the "trust moment" section to `README.md`.
5. Confirm the GitHub repository is public.
