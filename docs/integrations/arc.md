# Arc integration

Verified against docs.arc.io on 2026-11-06.

The product spec says Arc provides a "paymaster RPC for gasless investor
transactions". That wording is not accurate. Arc is Circle's L1 where **USDC is
the native gas token**. Arc has no built-in paymaster RPC. Gasless flows come
from standard patterns you operate yourself or buy from a provider. This doc
says what's real and proposes the simplest honest option.

## Network facts

| Item | Testnet | Mainnet |
| --- | --- | --- |
| Chain id | `5042002` | `5042` |
| RPC | `https://rpc.testnet.arc.io` | `https://rpc.mainnet.arc.io` |
| Explorer | `https://explorer.testnet.arc.io` | `https://explorer.arc.io` |
| Native currency | USDC (18 decimals) | USDC (18 decimals) |
| Faucet | `https://faucet.circle.com` (select Arc Testnet) | n/a |
| USDC ERC-20 interface | `0x3600000000000000000000000000000000000000` (6 decimals) | same |
| EURC (testnet) | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` | n/a |

SMX uses testnet only. Finality is under one second.

## What's real for "gasless"

The docs describe two supported patterns. Both need infrastructure you run.

| Option | What it is | Fit for SMX |
| --- | --- | --- |
| EIP-3009 relayer | The investor signs `transferWithAuthorization` for USDC. A funded relayer EOA submits it and pays gas in USDC. | Simple. Fits an "invest USDC" transfer. |
| ERC-4337 paymaster | A contract co-signs UserOperations and pays gas from its EntryPoint deposit. Needs EntryPoint v0.7 and a bundler. | Heavy for a hackathon. |
| AA providers | Alchemy (gas sponsorship), Biconomy, Circle Wallets, Crossmint, Dynamic and others support Arc. | Needs accounts and keys. |

Also available: EIP-7702 delegation works on Arc.

Not available: a public "paymaster RPC" endpoint you can point `viem` at.
We found none in the docs. Don't tell judges SMX uses one.

## Recommended plan

Use Arc as a **settlement-chain option for investor USDC**, with gas paid in
USDC, and be honest about gasless.

1. **Baseline (no gasless claim)**: Deploy `MockUSDC`-free `LiquidISA` to Arc
   testnet using the native USDC ERC-20 interface at `0x3600...0000`. Investors
   pay gas in USDC (cents). Sub-second finality makes the demo snappy.
2. **Simplest honest gasless**: an EIP-3009 relayer in the pgmb worker.
   - The browser asks the investor to sign an EIP-712 `TransferWithAuthorization`
     for the USDC amount to `LiquidISA` (or to the relayer).
   - `POST /creators/{ticker}/investments` receives the signature.
   - The worker, holding a funded relayer key (`ARC_RELAYER_PRIVATE_KEY`),
     submits the authorization and calls `invest` on the investor's behalf.
   - The investor holds only USDC and pays no gas. The relayer pays in USDC.
   - Caveat: `LiquidISA.invest` must credit tokens to the signer, not
     `msg.sender`. Add `investFor(address investor, ...)` with authorization
     handling, or use `receiveWithAuthorization` through the contract. The
     contracts workstream must decide this. If it's too much, use the baseline.
3. **Skip ERC-4337** unless a provider (Alchemy, Circle) offers a ready key.

Whether the testnet USDC contract supports `transferWithAuthorization` was not
verified. The docs page "Operate an EIP-3009 relayer on Arc" says it does.
Check `0x3600...0000` ABI on the explorer before building.

## Packages and versions

| Package | Version | Use |
| --- | --- | --- |
| `viem` | 2.57.16 | Chain config, signing, relayer. |
| `@circle-fin/developer-controlled-wallets` | 10.8.1 | Optional, Circle-managed wallets. |
| `@circle-fin/modular-wallets-core` | 1.0.16 | Optional, smart accounts with Circle paymaster. Not verified for Arc. |

Arc Foundry (`arc-forge`, `arc-cast`, `arc-anvil`) exists for contract
development. SMX uses Hardhat 3, which should deploy unchanged to Arc (Osaka
EVM baseline). Test one deploy early.

## Environment variables

| Variable | Secret | Description |
| --- | --- | --- |
| `ARC_RPC_URL` | No | `https://rpc.testnet.arc.io`. |
| `ARC_CHAIN_ID` | No | `5042002`. |
| `ARC_PRIVATE_KEY` | Yes | Deployer and oracle key. Funded from the faucet. |
| `ARC_RELAYER_PRIVATE_KEY` | Yes | Relayer for gasless transfers. Needs USDC for gas. |

## viem chain config

```ts
import { defineChain } from 'viem';

export const arcTestnet = defineChain({
	id: 5042002,
	name: 'Arc Testnet',
	nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
	rpcUrls: { default: { http: ['https://rpc.testnet.arc.io'] } },
	blockExplorers: { default: { name: 'Arc Explorer', url: 'https://explorer.testnet.arc.io' } },
	testnet: true,
});
```

## Relayer sketch (server)

```ts
import { createWalletClient, http, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const usdcAbi = parseAbi([
	'function transferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce,uint8 v,bytes32 r,bytes32 s)',
]);
const relayer = createWalletClient({
	account: privateKeyToAccount(process.env.ARC_RELAYER_PRIVATE_KEY as `0x${string}`),
	chain: arcTestnet,
	transport: http(),
});

export async function relayAuthorizedTransfer(a: Auth) {
	return relayer.writeContract({
		address: '0x3600000000000000000000000000000000000000',
		abi: usdcAbi,
		functionName: 'transferWithAuthorization',
		args: [a.from, a.to, a.value, a.validAfter, a.validBefore, a.nonce, a.v, a.r, a.s],
	});
}
```

Browser: `walletClient.signTypedData` with the USDC EIP-712 domain. Read `name`,
`version`, and `chainId` from the contract. Don't hardcode them.

## Demo fallback

Not required in simulated mode. Without `ARC_PRIVATE_KEY`, hide the "Gasless
on Arc" toggle. If the relayer is down, fall back to a normal `invest` (gas in
USDC), or simulated mode.

## Gotchas

- **Two USDC decimals**: native gas USDC has 18 decimals. The ERC-20 interface
  has 6. Use 6 for token math and 18 only for gas and `msg.value`.
- Minimum `maxFeePerGas` is 20 gwei in the mempool. Let viem estimate, don't
  hardcode low gas prices.
- Sending to `address(0)` reverts.
- Blocked (blocklisted) address reverts consume gas without a receipt.
- Type-3 (blob) transactions are rejected.
- `PREVRANDAO` is always 0.
- The product spec's "Arc paymaster RPC" line is inaccurate. Fix it when the
  docs are next touched, and don't repeat it in the pitch.
- Arc Testnet is also supported by Chainlink CRE (TypeScript), which makes it
  the best chain for a real CRE write.

## Sources

- [Connect to Arc](https://docs.arc.io/arc/references/connect-to-arc.md)
- [Contract addresses](https://docs.arc.io/arc/references/contract-addresses.md)
- [Relayers and paymasters](https://docs.arc.io/integrate/relayers-and-paymasters.md)
- [Account abstraction](https://docs.arc.io/arc/tools/account-abstraction.md)
