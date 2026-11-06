# Hedera integration

Verified against docs.hedera.com and npm on 2026-11-06.

SMX deploys `LiquidISA`, `CreatorShareToken`, and `MockUSDC` to Hedera testnet
through the JSON-RPC relay, using `viem`. For "gasless dividend streaming" SMX
uses the x402 payment protocol, with a limit you must know: Hedera's x402
scheme pays in HBAR or HTS tokens through native Hedera transactions, not EVM
transactions.

## Network facts

| Item | Value |
| --- | --- |
| Network | Hedera testnet |
| EVM chain id | `296` (mainnet is `295`) |
| JSON-RPC relay (Hashio) | `https://testnet.hashio.io/api` |
| Native currency | HBAR (18 decimals on the EVM side, 8 on the native side: tinybars) |
| Explorer | [HashScan](https://hashscan.io/testnet) |
| Faucet | [portal.hedera.com/faucet](https://portal.hedera.com/faucet) (EVM address or account id). See also the [faucet docs](https://docs.hedera.com/learn/getting-started/testnet-faucet.md). |

Hashio is for development and testing only. It has no documented rate limits
and can throttle during a hackathon. Keep a fallback relay URL in `.env`.

### HashScan URLs

- Transaction: `https://hashscan.io/testnet/transaction/<tx-hash-or-id>`
- Account or EVM address: `https://hashscan.io/testnet/account/<id-or-0x-address>`
- Contract: `https://hashscan.io/testnet/contract/<0x-address>`
- Token: `https://hashscan.io/testnet/token/<0.0.id>`

## Packages and versions

| Package | Version | Use |
| --- | --- | --- |
| `viem` | 2.57.16 | EVM client for contracts (browser and server). |
| `@x402/core` | 2.30.0 | x402 client and resource-server core. |
| `@x402/hedera` | 2.30.0 | Hedera `exact` scheme (client and server). |
| `@x402/express` | 2.30.0 | Express paywall middleware (Express 5 compatible not verified). |
| `@hiero-ledger/sdk` | 2.90.1 | Hedera native SDK (JS). Replaces `@hashgraph/sdk`. Needed only for x402 signing and token setup. |

```bash
npm install viem
npm install @x402/core @x402/hedera @hiero-ledger/sdk   # only for the x402 step
```

## Environment variables

| Variable | Secret | Description |
| --- | --- | --- |
| `CHAIN_RPC_URL` | No | `https://testnet.hashio.io/api`. Unset means simulated chain mode. |
| `CHAIN_ID` | No | `296`. |
| `ORACLE_PRIVATE_KEY` | Yes | ECDSA key (0x hex) of the oracle/deployer. Fund it from the faucet. |
| `HEDERA_X402_FACILITATOR_URL` | No | `https://x402.org/facilitator`. |
| `HEDERA_ACCOUNT_ID` | No | `0.0.x` account used for x402 payments. |
| `HEDERA_PRIVATE_KEY` | Yes | Key for that account (x402 signer). |
| `HEDERA_DIVIDEND_TOKEN_ID` | No | HTS token id used as the payment asset (for example a testnet USDC). |

## viem chain config

```ts
import { defineChain, createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

export const hederaTestnet = defineChain({
	id: 296,
	name: 'Hedera Testnet',
	nativeCurrency: { name: 'HBAR', symbol: 'HBAR', decimals: 18 },
	rpcUrls: { default: { http: [process.env.CHAIN_RPC_URL ?? 'https://testnet.hashio.io/api'] } },
	blockExplorers: { default: { name: 'HashScan', url: 'https://hashscan.io/testnet' } },
	testnet: true,
});

export const publicClient = createPublicClient({ chain: hederaTestnet, transport: http() });
export const oracle = privateKeyToAccount(process.env.ORACLE_PRIVATE_KEY as `0x${string}`);
export const walletClient = createWalletClient({ account: oracle, chain: hederaTestnet, transport: http() });
```

Browser: wire the same chain to `window.ethereum` (MetaMask or HashPack EVM).
Call `wallet_addEthereumChain` with chain id `0x128`.

```ts
await window.ethereum.request({
	method: 'wallet_addEthereumChain',
	params: [{
		chainId: '0x128',
		chainName: 'Hedera Testnet',
		nativeCurrency: { name: 'HBAR', symbol: 'HBAR', decimals: 18 },
		rpcUrls: ['https://testnet.hashio.io/api'],
		blockExplorerUrls: ['https://hashscan.io/testnet'],
	}],
});
```

## Hardhat 3 network

```ts
hederaTestnet: {
	type: 'http',
	chainType: 'l1',
	url: 'https://testnet.hashio.io/api',
	chainId: 296,
	accounts: [configVariable('HEDERA_PRIVATE_KEY')],
},
```

## Account and key setup

1. Create an ECDSA account in the [Hedera portal](https://portal.hedera.com).
   Use an ECDSA key, not ED25519. Only ECDSA keys map to an EVM address.
2. Copy the 0x private key into your Hardhat configuration variable. Don't
   commit it.
3. Fund the EVM address from the faucet.
4. Deploy with Ignition. Verify on HashScan. HashScan can verify contracts
   through Sourcify.

## What x402 means for SMX

x402 is an HTTP payment protocol built on status `402 Payment Required`. A
server answers an unpaid request with payment requirements. The client signs a
payment, retries with the payload in a header, and a facilitator verifies and
settles it. In x402 v2 the scheme is `exact`, and networks use CAIP-2 ids
(`hedera:testnet`).

What Hedera provides today:

- `@x402/hedera` implements the `exact` scheme for **native** Hedera
  `TransferTransaction`s of HBAR (`0.0.0`) or an HTS fungible token. The client
  signs a partial transaction. A **facilitator is the `feePayer`**, so the
  payer needs no HBAR for fees. This is the gasless part.
- The official facilitator `https://x402.org/facilitator` advertises
  `hedera:testnet` with no API key. `GET /supported` confirms it. Launa also
  hosts an open testnet facilitator at `https://testnet.facilitator.launa.dev`.
- The x402 Hedera scheme does **not** call EVM contracts. It moves HBAR or HTS
  tokens between Hedera accounts.

Consequence: the USDC in `LiquidISA` (an ERC-20 on the EVM side) is not the
asset x402 pays. SMX must pick one of the plans below.

## Plan: gasless dividend streaming

Goal for the demo: after the creator pays a dividend, holders see small
payments arrive with no gas from the creator or holders.

### Option A (recommended): HTS token as the dividend rail

1. Create an HTS fungible token on testnet that stands for dividend USDC
   (`HEDERA_DIVIDEND_TOKEN_ID`, 6 decimals). Use the Hedera portal or
   `TokenCreateTransaction` from `@hiero-ledger/sdk`. Associate holder
   accounts with it.
2. Keep onchain accounting in `LiquidISA` as designed (`distributeDividend`,
   `claim`). It remains the source of truth.
3. For the "stream" in the demo, the server worker exposes a paywalled
   resource and a creator-side x402 client pays holders pro rata:
   - `smx.pay_dividend` already computes the per-holder split in
     `oracle_events.payload`.
   - For each holder with a Hedera account id (optional field on the wallet
     profile), the worker runs one x402 `exact` payment of that holder's share
     through the facilitator.
4. Show each payment on HashScan. Label the demo "x402 stream on Hedera
   testnet (HTS)".

Minimal client code (creator-side payer):

```ts
import { x402Client } from '@x402/core/client';
import { createClientHederaSigner } from '@x402/hedera';
import { ExactHederaScheme } from '@x402/hedera/exact/client';
import { PrivateKey } from '@hiero-ledger/sdk';

const signer = createClientHederaSigner(
	process.env.HEDERA_ACCOUNT_ID!,
	PrivateKey.fromStringECDSA(process.env.HEDERA_PRIVATE_KEY!),
	{ network: 'hedera:testnet' },
);
export const x402 = new x402Client().register('hedera:*', new ExactHederaScheme(signer));
```

Minimal resource server (a "claim" endpoint that gates on payment). The pay-to
account receives funds:

```ts
import { x402ResourceServer, HTTPFacilitatorClient } from '@x402/core/server';
import { ExactHederaScheme } from '@x402/hedera/exact/server';

const facilitator = new HTTPFacilitatorClient({ url: process.env.HEDERA_X402_FACILITATOR_URL! });
export const resourceServer = new x402ResourceServer(facilitator).register(
	'hedera:*',
	new ExactHederaScheme({
		defaultAssets: { 'hedera:testnet': { asset: process.env.HEDERA_DIVIDEND_TOKEN_ID!, decimals: 6 } },
	}),
);
```

`HTTPFacilitatorClient` is exported by `@x402/core/server` (2.30.0) and takes
`{ url }` (optional `timeout`). The Hedera docs only show `facilitatorClient`
as a variable, so we checked the package types for the class name.

### Option B: simulate

Skip HTS. The worker marks the dividend `PAID` with a SIMULATED hash and the
UI animates a "stream" of per-holder payments (SSE ticks) from the
`DIVIDEND_PAID` event. Be explicit in the UI that it's simulated. This is the
no-keys default.

### Option C: x402-gated API only

Use x402 to charge for something small (for example, the `/api/audit-milestone`
report download). It proves the protocol without moving dividends. Pick this
only if A fails.

Do not claim that x402 pays EVM ERC-20 dividends on Hedera. It doesn't.

## Demo fallback

With `CHAIN_RPC_URL` unset the app runs in simulated chain mode (see the
product spec). With no `HEDERA_*` x402 keys, use Option B.

## Gotchas

- Use ECDSA keys. ED25519 accounts have no EVM address.
- Hedera EVM native value uses 18 decimals in JSON-RPC but tinybars (8) in
  native APIs. Convert carefully.
- HTS token transfers require the receiver to be **associated** with the token.
- Gas price is set by the network. The relay quotes it. Let viem estimate and
  add 20% headroom for contract deploys.
- Hashio can return slow or 5xx errors under load. Retry with backoff in the
  worker.
- JS SDK package renamed: use `@hiero-ledger/sdk`, not `@hashgraph/sdk`
  (the latter still exists at 2.81.0 but is no longer where releases ship).
- Hedera's docs say not to call Hedera a "blockchain". Use "public ledger" in
  user-facing copy if a Hedera judge is listening.
- Ask at the Hedera booth (pitch playbook): do they recommend a bridge to an
  EVM testnet for an AMM pool? SMX's AMM is simulated in Postgres, so it is not
  blocking.

## Sources

- [Accept x402 on Hedera](https://docs.hedera.com/solutions/ai/x402/merchant-integration.md)
- [Pay with x402 on Hedera](https://docs.hedera.com/solutions/ai/x402/pay-with-x402.md)
- [x402 facilitators](https://docs.hedera.com/solutions/ai/x402/facilitators.md)
- [Hedera exact scheme](https://docs.hedera.com/solutions/ai/x402/exact-scheme.md)
- [JSON-RPC relay](https://docs.hedera.com/hedera/core-concepts/smart-contracts/json-rpc-relay)
