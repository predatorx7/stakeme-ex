# AGENTS.md: packages/contracts

## Role

Solidity contracts for StakeMe Exchange (SMX), built with Hardhat 3, viem and
`node:test`. The app imports ABIs and deployment addresses from
`@stakeme/contracts`.

## Layout

- `contracts/`: `MockUSDC`, `CreatorShareToken`, `LiquidISA`, `LiquidISAFactory`. The ISA and token are EIP-1167 clones: `initialize(...)` replaces constructors, no `immutable` config, implementations call `_disableInitializers()`.
- `test/`: TypeScript `node:test` tests (core logic only).
- `ignition/modules/Deploy.ts`: Ignition deploy for local, Sepolia and 0G.
- `scripts/deploy-hedera.ts`: viem deploy for Hedera (explicit gas = estimate + 20%), writes `deployments/hedera-testnet.json` and the root `.env`.
- `scripts/export-abis.ts`: writes `src/abis.gen.ts` and `src/deployments.gen.ts`.
- `src/index.ts`: public entry point (`exports["."]`). Run by Node type
  stripping, so no enums or namespaces and use `.ts` import extensions.

## Rules

- Never commit keys. Networks read `HEDERA_PRIVATE_KEY`, `SEPOLIA_PRIVATE_KEY`,
  `SEPOLIA_RPC_URL`, `OG_PRIVATE_KEY` through `configVariable`.
- Do not edit `*.gen.ts`; run `npm run abis` after changing a contract.
- Use custom errors, `SafeERC20` and `ReentrancyGuard` for fund movement.
- Keep dividend payouts O(1); never loop over holders.
- Tabs for indentation in TypeScript and Solidity; LF line endings.
- Test only core logic: happy path, liquidation, access control.
- The solc config uses `viaIR` for both profiles because `createISA` is deep.
