// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Testnet-only USDC stand-in with 6 decimals. `mint` is open (used by
/// ISAs to seed pools with protocol-provided demo liquidity); `faucet` is the
/// capped path for demo wallets.
contract MockUSDC is ERC20 {
	/// @notice Max USDC (base units) one `faucet` call can mint: 50,000 USDC.
	uint256 public constant FAUCET_CAP = 50_000 * 1e6;

	error FaucetCapExceeded();

	constructor() ERC20("Mock USD Coin", "USDC") {}

	function decimals() public pure override returns (uint8) {
		return 6;
	}

	function mint(address to, uint256 amount) external {
		_mint(to, amount);
	}

	/// @notice Public faucet so demo wallets can fund themselves.
	function faucet(address to, uint256 amount) external {
		if (amount > FAUCET_CAP) revert FaucetCapExceeded();
		_mint(to, amount);
	}
}
