# 04: Wallets

Summary reconstructed from the repository. Source: `CONTEXT.md`, section
"Wallets (WalletConnect, 2026-11-06)", and `docs/frontend-hooks.md`.

## Direction

Let a user connect a wallet in several ways and sign Hedera payments from their
own wallet. The decision log records the resulting behavior:

- Sign-in options, in order: WalletConnect (only with a project id), generate a
  new wallet, import a key; plus a browser extension only when one exists.
- The Hedera payment signer offers the same three choices.
- A generated or imported key can be revealed and copied.

## Key decision: no silent fallback

Quoted from `CONTEXT.md`:

> No silent fallback: closing the WalletConnect modal, closing the dialog or a wallet rejecting aborts with "Connection cancelled"

No key is generated and nothing is stored unless the user picks Generate or
Import.

## Human steps

A person created the WalletConnect project and allowlisted the origin. The
project id is public and is set in `.env`; no secret is recorded in this file.

## Known gaps

`CONTEXT.md` lists what was not verified live, for example a full wallet
signing round trip. Read "Known issues" there.
