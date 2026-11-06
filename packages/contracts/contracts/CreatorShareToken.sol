// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice ERC-20 income-share token with built-in dividend accounting
/// (ERC-2222 style). The owner (the LiquidISA) mints shares, accrues
/// dividends and settles claims; it holds the USDC itself.
contract CreatorShareToken is ERC20 {
	/// @dev Fixed-point scale that keeps per-share precision under integer division.
	uint256 internal constant MAGNITUDE = 2 ** 128;

	address public immutable owner;

	uint256 public magnifiedDividendPerShare;
	mapping(address => int256) internal magnifiedDividendCorrections;
	mapping(address => uint256) public withdrawnDividends;

	error NotOwner();
	error NoShares();

	constructor(string memory name_, string memory symbol_, address owner_) ERC20(name_, symbol_) {
		owner = owner_;
	}

	modifier onlyOwner() {
		if (msg.sender != owner) revert NotOwner();
		_;
	}

	function mint(address to, uint256 amount) external onlyOwner {
		_mint(to, amount);
	}

	/// @notice Adds `amount` of dividends to the accumulator. O(1).
	function accrue(uint256 amount) external onlyOwner {
		uint256 supply = totalSupply();
		if (supply == 0) revert NoShares();
		magnifiedDividendPerShare += (amount * MAGNITUDE) / supply;
	}

	/// @notice Marks all of `holder`'s withdrawable dividends as paid and returns the amount.
	function settle(address holder) external onlyOwner returns (uint256 amount) {
		amount = withdrawableDividendOf(holder);
		withdrawnDividends[holder] += amount;
	}

	function accumulativeDividendOf(address holder) public view returns (uint256) {
		int256 total = int256(magnifiedDividendPerShare * balanceOf(holder)) + magnifiedDividendCorrections[holder];
		return uint256(total) / MAGNITUDE;
	}

	function withdrawableDividendOf(address holder) public view returns (uint256) {
		return accumulativeDividendOf(holder) - withdrawnDividends[holder];
	}

	/// @dev Corrections keep each holder's accumulated dividends unchanged by
	/// mints, burns and transfers, so no per-holder loop is ever needed.
	function _update(address from, address to, uint256 value) internal override {
		super._update(from, to, value);
		int256 delta = int256(magnifiedDividendPerShare * value);
		if (from != address(0)) magnifiedDividendCorrections[from] += delta;
		if (to != address(0)) magnifiedDividendCorrections[to] -= delta;
	}
}
