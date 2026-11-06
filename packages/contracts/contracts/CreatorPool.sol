// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface ILiquidISAStatus {
	function tradingOpen() external view returns (bool);
}

/// @notice Constant-product AMM (x * y = k) pairing MockUSDC (6 decimals) with one
/// creator's CreatorShareToken (18 decimals). 0.3% input fee stays in the pool,
/// so k grows. Math mirrors the SQL `amm_swap`: output rounds down, reserves
/// take the full input. Cloned (EIP-1167) per IPO by the factory and seeded by
/// the ISA when the raise closes (protocol-provided demo liquidity).
/// Trading is open only while `LiquidISA.tradingOpen()` (raise closed, not
/// defaulted, not frozen). Selling stays open after the term ends.
contract CreatorPool is ReentrancyGuard, Initializable {
	using SafeERC20 for IERC20;

	uint256 public constant FEE_BPS = 30; // 0.3%
	uint256 internal constant BPS = 10_000;

	IERC20 public usdc;
	IERC20 public token;
	address public isa;
	uint256 internal reserveUsdc;
	uint256 internal reserveToken;
	bool public seeded;

	event Seeded(uint256 usdcAmount, uint256 tokenAmount);
	event Swap(
		address indexed trader,
		uint256 usdcIn,
		uint256 tokenIn,
		uint256 usdcOut,
		uint256 tokenOut,
		uint256 usdcReserve,
		uint256 tokenReserve
	);

	error NotISA();
	error AlreadySeeded();
	error NotSeeded();
	error NotFunded();
	error TradingHalted();
	error ZeroAmount();
	error InsufficientOutput();
	error Slippage();

	/// @dev Locks the implementation; clones are set up through `initialize`.
	constructor() {
		_disableInitializers();
	}

	function initialize(address usdc_, address token_, address isa_) external initializer {
		usdc = IERC20(usdc_);
		token = IERC20(token_);
		isa = isa_;
	}

	/// @notice The ISA records the reserves it just minted to this pool. Once.
	function seed(uint256 usdcAmount, uint256 tokenAmount) external {
		if (msg.sender != isa) revert NotISA();
		if (seeded) revert AlreadySeeded();
		if (usdcAmount == 0 || tokenAmount == 0) revert ZeroAmount();
		if (usdc.balanceOf(address(this)) < usdcAmount || token.balanceOf(address(this)) < tokenAmount) {
			revert NotFunded();
		}
		seeded = true;
		reserveUsdc = usdcAmount;
		reserveToken = tokenAmount;
		emit Seeded(usdcAmount, tokenAmount);
	}

	function getReserves() external view returns (uint256 usdcReserve, uint256 tokenReserve) {
		return (reserveUsdc, reserveToken);
	}

	function tradingOpen() public view returns (bool) {
		return seeded && ILiquidISAStatus(isa).tradingOpen();
	}

	/// @notice Tokens received for spending `amountIn` USDC base units (rounded down).
	function quoteBuy(uint256 amountIn) public view returns (uint256) {
		return _out(amountIn, reserveUsdc, reserveToken);
	}

	/// @notice USDC base units received for selling `amountIn` token base units (rounded down).
	function quoteSell(uint256 amountIn) public view returns (uint256) {
		return _out(amountIn, reserveToken, reserveUsdc);
	}

	/// @notice Spends `amountIn` USDC (caller must approve this pool) for tokens sent to `to`.
	function swapExactUsdcForTokens(uint256 amountIn, uint256 minOut, address to)
		external nonReentrant returns (uint256 amountOut)
	{
		_checkOpen(amountIn);
		amountOut = quoteBuy(amountIn);
		if (amountOut == 0) revert InsufficientOutput();
		if (amountOut < minOut) revert Slippage();
		reserveUsdc += amountIn;
		reserveToken -= amountOut;
		usdc.safeTransferFrom(msg.sender, address(this), amountIn);
		token.safeTransfer(to, amountOut);
		emit Swap(msg.sender, amountIn, 0, 0, amountOut, reserveUsdc, reserveToken);
	}

	/// @notice Sells `amountIn` tokens (caller must approve this pool) for USDC sent to `to`.
	function swapExactTokensForUsdc(uint256 amountIn, uint256 minOut, address to)
		external nonReentrant returns (uint256 amountOut)
	{
		_checkOpen(amountIn);
		amountOut = quoteSell(amountIn);
		if (amountOut == 0) revert InsufficientOutput();
		if (amountOut < minOut) revert Slippage();
		reserveToken += amountIn;
		reserveUsdc -= amountOut;
		token.safeTransferFrom(msg.sender, address(this), amountIn);
		usdc.safeTransfer(to, amountOut);
		emit Swap(msg.sender, 0, amountIn, amountOut, 0, reserveUsdc, reserveToken);
	}

	function _checkOpen(uint256 amountIn) internal view {
		if (amountIn == 0) revert ZeroAmount();
		if (!seeded) revert NotSeeded();
		if (!ILiquidISAStatus(isa).tradingOpen()) revert TradingHalted();
	}

	/// @dev floor(rOut * in * 997 / (rIn * 1000 + in * 997)); equals SQL
	/// trunc(rOut * eff / (rIn + eff)) with eff = in * 0.997.
	function _out(uint256 amountIn, uint256 rIn, uint256 rOut) internal pure returns (uint256) {
		if (amountIn == 0 || rIn == 0 || rOut == 0) return 0;
		uint256 eff = amountIn * (BPS - FEE_BPS);
		return (rOut * eff) / (rIn * BPS + eff);
	}
}
