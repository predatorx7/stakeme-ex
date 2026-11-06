# Demo video plan

This document is the plan for the three-minute ETHGlobal submission video of
StakeMe Exchange (SMX). It contains the shot list, the pre-recording checklist,
a fallback plan, and a 60-second judge walkthrough. It follows the stage
timing in [pitch.md](pitch.md), adjusted to the sponsors that are built for the
MVP: Hedera, World ID, 0G and Reclaim. Chainlink CRE and Arkiv are not in the
build, so the video does not show or claim them. The 0G agent audits the proof
directly, and 0G Storage holds the L-ISA terms.

Items marked **Unconfirmed** could not be verified on screen. They come from
the source and docs, not from a live run.

## Conventions

- `$APP` is `http://localhost:4020` for recording and the deployed URL
  (`https://stakeme.magnificlabs.org`, see [deployment.md](deployment.md)) for
  judges.
- Button and label text is copied from the components in
  `packages/app/src/components/pages/`.
- The **live creator** is the IPO you launch in shot 2. The seeded creators
  (`MUSH`, `RAVI`, `RAHUL`) belong to fixed demo wallets that you cannot sign in
  as, so only the live creator can use the Hub (Reclaim proof, dividend
  payment).
- Use an unused ticker for the live IPO, for example `SMXD`. The seed already
  owns `MUSH`, `RAVI` and `RAHUL`.

## Shot list

Total running time: 3:00. Each shot lists the screen, the clicks, the
voiceover, and the proof that a sponsor integration is real.

### Shot 1: Hook (0:00 to 0:25)

- **Screen:** `$APP/` (Exchange). Header: StakeMe Exchange (SMX), KPIs
  "Total raised", "Active creators", "Dividends paid", the "Trending humans"
  table, and the "Live oracle events" feed.
- **Clicks:** None. Slowly scroll from the KPIs to the trending table
  ($MUSH, $RAVI, $RAHUL, with price, 24h change and sparkline) and the feed.
- **Voiceover:** "Day traders speculate on dead corporations while banks refuse
  to lend to brilliant young talent. StakeMe Exchange lets you IPO your future
  income. Investors fund you today and receive enforced dividends from your
  real income. This is the world's first liquid stock market for human
  potential."
- **Proves:** Nothing sponsor-specific yet. Establishes that the market is live
  with seeded data.

### Shot 2: Self-IPO with World ID (0:25 to 1:05)

- **Screen:** `$APP/launch`, then the Hub at `$APP/hub`.
- **Clicks:**
  1. Click **Launch your IPO** in the header. The wallet dialog opens.
  2. Click **Generate a new wallet** (or "Use the wallet saved in this
     browser" if one exists). SIWE signs in with no popup. The page shows the
     "Wallet connected" badge and the short address.
  3. Type the pre-planned values (type fast, or paste from a note): Ticker
     `SMXD`, Display name `Mushaheed`, Headline, Target raise `10000.00`,
     Your stake `500.00`. Leave "Income share (%)" at 5 and "Term (months)" at
     60. Optionally add a social link, and keep the default 3-tranche preset
     and monthly proof cadence.
  4. Click **Verify with World ID**. A QR code and link appear.
  5. Switch to the prepared World ID Simulator window
     (`simulator.worldcoin.org`), use **Paste code**, paste the IDKit link, and
     approve. Switch back. The "Verified" pill appears and **Launch IPO**
     enables.
  6. Click **Launch IPO**. The page redirects to the Hub.
- **Voiceover:** "Mushaheed connects a wallet and sets his terms: raise
  $10,000, stake $500, share 5% of income for five years. World ID proves one
  human, one IPO. No fake accounts. He launches, and the L-ISA terms are
  written to 0G Storage and his equity token is minted through Hedera's Asset
  Tokenization Studio."
- **Proves:**
  - **World ID:** the "Verified" pill after the Simulator approval. Optionally
    flash the Simulator window showing the approved request. Cut to the next
    shot before the success state fades.
  - **Hedera:** on `/creators/SMXD`, the "Token on Hedera" row and the
    transaction hash links under Escrow. Click one `TxLink`; it opens
    `https://hashscan.io/testnet/transaction/<hash>`. Show the SUCCESS result
    for 2 seconds, then return.
  - **Hedera ATS:** the creator's ATS equity token address (`ATS_MODE=live`)
    opens on HashScan as a contract. If the live mint errors, the token is
    simulated and has no HashScan page; say so on camera.
  - **0G Storage:** "0G Storage ref" on the L-ISA terms card reads "0G Storage:
    pending", then flips to the root hash after about 30 seconds (the
    `STORAGE_CONFIRMED` event reloads the region over SSE). Click the hash to
    open `https://indexer-storage-testnet-turbo.0g.ai/file/info/<root>`.
    **Unconfirmed:** this URL form has not been checked in a browser.
- **Editing note:** the upload takes about 30 seconds. Do not wait on camera.
  Cut to shot 3 and return to the creator page in shot 5, or insert the
  confirmed state as a jump cut.

### Shot 3: Raise (1:05 to 1:25)

- **Screen:** `$APP/creators/SMXD`, the **Invest** card, then the Hub.
- **Clicks:** Open a second browser profile or window that is signed in with a
  different generated wallet (prepared in advance). On `/portfolio`, click
  **Get test USDC** once (1,000 MockUSDC). Back on the creator page, enter an
  amount in **Amount (USDC)** and click **Invest**; the wallet signs `approve`,
  then `invest`, and the server verifies the receipt. In the first window, open
  the Hub and click **Close raise now**. The Escrow card shows "Raised" and
  "Released to creator" advance, and tranche 0 is released. The pool opens for
  trading.
- **Voiceover:** "Investors fund Mushaheed from their own wallets. When the
  raise closes, 20% releases now. The rest stays in escrow and only unlocks as
  he proves income."
- **Proves:** Escrow and tranche releases with Hedera transaction links
  (`TxLink`), and an onchain pool seeded at raise close.
- **Cost warning:** Invest and close-raise cost testnet gas. If the take count
  matters, record this shot against the seeded `$MUSH` or `$RAVI` page for the
  same Invest card instead (the Escrow card shows the same numbers).

### Shot 4: Reclaim proof and 0G audit (1:25 to 2:00)

- **Screen:** `$APP/hub`, the **Web2 income verification** card, then
  `$APP/mock-bank/login`.
- **Clicks:**
  1. On the Hub, click **Verify income with Reclaim**. A QR code and link
     appear in the card.
  2. Open the link (or scan it) in the second window. Reclaim opens the HDFC
     Bank NetBanking demo at `/mock-bank/login`. Enter any Customer ID and
     password, keep **Salary on time** selected (the other five scenarios are
     low $800, big $25,000, several deposits, none and late), click **Login**.
     The statement shows a $5,000 deposit.
  3. Reclaim generates the zkTLS proof. Return to the Hub. The page updates
     over SSE (`PROOF_VERIFIED`).
  4. Scroll to **Income proofs**: the proof row shows the 0G Storage log ref.
     Scroll to **Pending dividend**: "0G AI detected $5,000.00 income. You owe
     $250.00 USDC."
- **Voiceover:** "At the month-three deadline, Mushaheed proves a $5,000 bank
  deposit with Reclaim zkTLS. His bank never shares a password with us. The 0G
  agent audits the proof against his terms, writes the audit log to 0G
  Storage, and computes the dividend: 5% of $5,000 is $250."
- **Proves:**
  - **Reclaim:** the QR flow plus the verified proof row in **Income proofs**.
    Show the Reclaim verification screen on the second window.
  - **0G:** "0G AI detected ... income" text, and the "0G Storage log ref" link
    on the proof row, which opens `indexer-storage-testnet-turbo.0g.ai/file/info/<root>` the same way as
    in shot 2.
- **Unconfirmed:** the live Reclaim loop end to end in the app. The provider
  points at the production mock bank, so recording against `localhost` needs
  a public URL that matches the provider version. Verify before recording. If
  the live loop is unavailable, use the fallback in section "Fallback plan".
- **Late scenario:** pick **Late** to show the pre-check. The auditor denies
  the 40-day-old deposit with "Deposit is outside the reporting period" and
  the audit log shows engine `pre-check`, with no 0G call.

### Shot 5: Dividend on Hedera (2:00 to 2:20)

- **Screen:** `$APP/hub`, **Pending dividend** card.
- **Clicks:**
  1. Click **Pay 0.025 HBAR on Hedera** (the testnet rate is 0.0001 HBAR per
     USDC, so $250 is 0.025 HBAR). In live mode, the signer dialog opens: choose **Generate a new wallet** (a funded key prepared in advance,
     see the checklist) or WalletConnect.
  2. The status line next to the button shows progress, then the dividend
     moves to **Dividends paid** with receipt links.
  3. Click a receipt link to open the HashScan transaction.
- **Voiceover:** "Mushaheed pays the dividend. One Hedera transaction pays
  every holder in proportion to their tokens. The next tranche unlocks
  automatically."
- **Proves:** **Hedera:** the HashScan testnet transaction page showing a
  transfer to the holder accounts. Live settlement ran on testnet (for example
  `0.0.11340822@1793996054.174485762`). Outside production, a server without
  `HEDERA_OPERATOR_*` returns `sim:` receipts with no HashScan page. Check
  that `GET /dividends/{id}/payment-request` returns `mode: "live"` before
  recording.

### Shot 6: Scam protection (2:20 to 2:40)

- **Screen:** `$APP/creators/RAHUL`.
- **Clicks:** In a terminal window beside the browser, run the demo trigger
  (this changes demo data only; it does not send a chain transaction from
  your wallet, but it queues an `executeLiquidation` chain job that costs
  testnet gas on the worker):

  ```sh
  curl -s -X POST http://localhost:4020/api/trigger-default \
    -H 'content-type: application/json' \
    -H "X-Admin-Key: $SMX_ADMIN_KEY" -d '{"ticker":"RAHUL"}'
  ```

  Requires `DEMO_MODE=1` and `SMX_ADMIN_KEY` set on the server; otherwise it returns `403`.

  The page reloads over SSE. A danger notice reports the default and the
  status badge reads Defaulted.
- **Voiceover:** "Rahul takes his first tranche and disappears. No proof
  arrives. The agent freezes his escrow and starts a 14-day grace period. When
  it ends, locked escrow is refunded to the current token holders, his stake
  is slashed to them, and his World ID is blacklisted. He can never IPO again."
- **Proves:** **World ID** blacklisting is shown by the defaulted state. For a
  stronger proof, return to `/launch` with a second wallet and click
  **Simulate Sybil** if available (`DEMO_MODE=1`); it reports a used or
  blacklisted nullifier. **Unconfirmed:** the exact wording of the error.
- **Note:** seeded RAHUL may already be in the grace period (the sweep runs
  every 60 seconds by default). The trigger works from either state.

### Shot 7: Close (2:40 to 3:00)

- **Screen:** `$APP/` (Exchange), then a final title card with the repo URL and
  the QR code of the deployed URL.
- **Clicks:** Click **Buy** on the `$SMXD` row; the creator page opens at the
  order ticket. Show the depth, the stats and the cost estimate. Do not click
  **Buy** on camera unless you accept the gas cost (the wallet signs `approve`
  and the pool swap). Open `/portfolio` to show funds, holdings and P&L.
  Return to the Exchange and show the price chart and the feed.
- **Voiceover:** "Hold the token for dividends, or trade it on life events.
  Scan the QR code to try it. Five percent of any prize streams to token
  holders. StakeMe Exchange: invest in people."
- **Proves:** The live oracle feed showing `DIVIDEND_PAID` and `DEFAULTED`
  events from the previous shots.

## Pre-recording checklist

### Data

1. Stop the dev server (PGlite is single-process).
2. Reset and reseed:

   ```sh
   npm run dev -- --clear   # then stop it again with Ctrl+C
   npm run seed:demo
   npm run dev
   ```

   `seed:demo` is idempotent but does not reset. Use `--clear` to start from a
   known state (this also removes any earlier live creators such as `SMXD`).
   **Unconfirmed:** whether `dev -- --clear` exits on its own or starts the
   server; check before relying on it.
3. Confirm the Exchange lists `$MUSH`, `$RAVI`, `$RAHUL` and the feed has
   events.
4. A World ID can launch only one IPO and there is no nullifier reset
   (CONTEXT.md). Each take that completes a launch consumes the Simulator
   identity's nullifier. Reseed with `--clear` between takes, which also
   clears it.

### Funded balances and budget

| Resource | Needed for | Notes |
| --- | --- | --- |
| Hedera testnet HBAR (server relay and oracle key) | Chain jobs: `createISA`, `initializeIPO`, `invest`, dividends, liquidation | `createISA` costs about 0.76 HBAR per IPO. Every take that launches an IPO spends real testnet HBAR. A fresh factory deploy costs about 3.7 HBAR. Fund from the Hedera faucet. |
| Hedera account for the dividend signer | Shot 5 | The key generated in the signer dialog needs a Hedera account on testnet: fund its printed EVM address from the faucet once (CONTEXT.md). The server pays network fees; the account needs only the dividend amount. |
| 0G Galileo (`ZG_PRIVATE_KEY`) | Terms upload (shot 2) and audit log (shot 4) | About 0.0013 0G per storage upload, so about 0.0026 per full take. Uploads are skipped below `ZG_STORAGE_MIN_BALANCE` (default 0.1), so keep the balance above that. |
| `HEDERA_OPERATOR_*` | Live dividend payment and the ATS mint | Without it the rail is simulated and the production server refuses payment requests. |
| MockUSDC for investors | Shot 3 | Each investor wallet clicks **Get test USDC** (1,000 per click, 50,000 cap). |

Budget the take count: plan for at most 5 full takes. At about 1 HBAR and
about 0.003 0G per take (plus the one-time funding of the dividend signer), 5
takes need roughly 5 to 6 HBAR and a 0G balance comfortably above 0.1.
**Unconfirmed:** the HBAR cost of invest, dividend and liquidation calls; check
the balance after one full take and extrapolate.

### Browser windows

Prepare these before you start recording:

1. **Window A (main):** `$APP/` signed out. Clear `localStorage` for the
   origin so no key is saved (or you will see "Use the wallet saved in this
   browser").
2. **Window B (investor and Reclaim):** a second profile signed in with another
   generated wallet.
3. **Window C (World ID Simulator):** `https://simulator.worldcoin.org` with the
   staging app set up. Open the **Paste code** flow and test it once with a
   dry-run (CONTEXT.md records a verified end-to-end run: paste the IDKit link
   into Paste code). Staging actions verify only in the Simulator.
4. **Window D (HashScan):** `https://hashscan.io/testnet` ready.
5. **Window E (0G Storage explorer):** `https://indexer-storage-testnet-turbo.0g.ai/file/info/<root>`.
6. **Terminal:** the `curl` command from shot 6, typed but not run.
7. **Notes:** the field values for the launch form.

### Display settings

- **Theme:** use dark mode. The Diwali theme is designed for a night-sky
  canvas and reads best on video. Toggle it with the header theme control
  (`data-theme-toggle`); the choice is stored in `localStorage`
  (`reclaim-theme`). Test both once to pick.
- **Reduced motion:** turn it **off** (System Settings, Accessibility,
  Display, Reduce motion). With it on, the sparkle and diya effects
  (`data-dw-sparkle`) are disabled, and the video loses the polish.
- **Window size:** 1920 by 1080 at 100% zoom; the app switches to bottom tabs
  below 900 px, so do not record narrower. Hide bookmarks and extensions.
- Turn on Do Not Disturb to hide notifications.
- Record audio separately from a script, then align it in editing.

### Environment

- `DEMO_MODE=1` (needed for **Simulate deposit**, **Simulate Sybil**,
  **Mark as paid (demo)** and `trigger-default`). The checked `.env` has it
  set. Demo proofs also need the signed-in creator owner and allow 3 per
  creator per hour; `trigger-default` needs `SMX_ADMIN_KEY`.
- `ATS_MODE=live` for the real ATS token mint.
- `CHAIN_RPC_URL` set (live Hedera testnet). Unset it for a simulated run,
  but then transaction links have no HashScan page.
- `WORLD_ENV=staging`, `WORLD_APP_ID`, `WORLD_RP_ID`, `WORLD_RP_SIGNING_KEY`.
  Without them, the demo World ID buttons appear instead of a real QR code.
  **Unconfirmed on screen:** which of the two modes the dev server is in.
- The Reclaim provider version points at the mock bank host you demo.
- Dry run the whole sequence once end to end before the first recorded take.

## Fallback plan

Every sponsor call has a demo fallback that logs a warning. If a live call
fails during recording, say so on camera. Never present a fallback as a live
result.

| Step | Failure | Fallback | What to say |
| --- | --- | --- | --- |
| World ID (shot 2) | Simulator unreachable or request rejected | Click **Simulate success** (shown when `DEMO_MODE=1` and no real World ID app is configured, or after clicking Verify without an app id). | "The World ID Simulator is unreachable, so this uses our demo proof. The live Simulator flow is shown in the submission repo." |
| Reclaim (shot 4) | Provider error, no callback | Click **Simulate deposit** (`DEMO_MODE` only, creator owner only). It posts a fixture proof to `/api/audit-milestone` and reloads. | "The live Reclaim callback is down. This button submits a fixture proof so the audit and dividend run as normal. The Reclaim session and the mock bank are real; only the proof is simulated." |
| 0G Storage (shots 2, 4) | Upload fails or is slow | The ref stays `local:<sha256>`. The page still shows the document hash. | "The upload to 0G Storage retries in the background. The local hash already proves the document; the root hash appears when the upload finishes." |
| 0G audit (shot 4) | Router unavailable | The proof stays PENDING with "0G audit unavailable, retry". There is no silent fallback; the rules engine runs only behind `ZG_ALLOW_RULES_FALLBACK=1` and is labelled. | "0G is unavailable, so the proof waits for a retry. We do not approve without the 0G audit." |
| Hedera ATS (shot 2) | Live ATS call errors | The token is simulated (status `SIMULATED`) and the IPO still completes. | "The ATS mint failed, so this token is simulated. The live mint is on HashScan at the address in the README." |
| Hedera (shots 2, 3, 5) | Hashio throttled, relay error, balance low | Chain jobs show a failed or pending badge. A failed job is not retried after `SENT`. Without `CHAIN_RPC_URL`, hashes are simulated and have no HashScan page. For the dividend, click **Mark as paid (demo)** (`DEMO_MODE`). | "Hedera's public relay is rate limited. The job is queued and settles on retry. Simulated hashes are labeled as such and are not on HashScan." |
| Default (shot 6) | `curl` returns 403 | `DEMO_MODE` is not `1`. Restart with it set. | None needed. |

If a step fails and cannot be recovered in the take, stop, reseed
(`--clear`, then `seed:demo`) and retake. Do not edit the failed result into
the video as if it succeeded. Where a fallback is used, add an on-screen
caption ("Demo fallback") for the duration of that step.

For the submission, keep one honest sentence in the video description:
"World ID, Reclaim, 0G and Hedera run live on testnet. Where a live call
failed, a labeled demo fallback is shown."

## Judge walkthrough (60 seconds)

For the deployed URL (`https://stakeme.magnificlabs.org`). The deployed
instance runs with the real Hedera and 0G keys. **Unconfirmed:** whether
`DEMO_MODE` is on there; the demo buttons below need it.

1. **0:00. Exchange.** Open `/`. See the KPIs, the three seeded creators, and
   the live oracle feed.
2. **0:10. Token page.** Click `$MUSH`. Find the L-ISA terms, the "0G Storage
   ref" link (indexer-storage-testnet-turbo), the "Token on Hedera" address, and the transaction
   hashes (HashScan).
3. **0:25. Defaulted creator.** Go back and click `$RAHUL`. If a default was
   triggered, read the danger notice (refund, slash, blacklist).
4. **0:30. Sign in and launch.** Click **Launch your IPO**, then **Generate a
   new wallet**. Fill the form, click **Verify with World ID**, then
   **Simulate success** (or use the World ID Simulator with Paste code), and
   click **Launch IPO**.
5. **0:45. Prove income.** On the Hub, click **Simulate deposit**. See
   the $250 pending dividend and the 0G audit text. Click **Verify income with
   Reclaim** to see the real zkTLS session QR.
6. **0:55. Pay.** Click **Pay 0.025 HBAR on Hedera** (needs a funded Hedera
   account) or **Mark as paid (demo)**. Open a receipt link in HashScan.

Tell judges that a launched IPO spends real testnet gas on our relay, so
please launch at most one.
