// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {CreatorShareToken} from "./CreatorShareToken.sol";

interface IISAFactory {
	function blacklistFromISA(bytes32 nullifierHash) external;
}

/// @notice One Income Share Agreement per creator. Investors buy share tokens,
/// raised USDC sits in escrow and is released to the creator in tranches
/// unlocked by the oracle. Income dividends flow back to token holders; if the
/// creator defaults, escrow plus the creator's stake are refunded pro rata.
contract LiquidISA is ReentrancyGuard {
	using SafeERC20 for IERC20;

	uint256 public constant BPS = 10_000;
	/// @dev 1 USDC (6 decimals) mints 1 share token (18 decimals).
	uint256 public constant SCALE = 1e12;

	struct Params {
		address usdc;
		address creator;
		address oracle;
		string name;
		string ticker;
		uint256 totalRaise;
		uint256 creatorStake;
		uint16 shareBps;
		uint16 termMonths;
		uint16[] trancheBps;
		bytes32 worldIdNullifierHash;
	}

	IERC20 public immutable usdc;
	CreatorShareToken public immutable token;
	address public immutable factory;
	address public immutable creator;
	address public immutable oracle;
	bytes32 public immutable worldIdNullifierHash;
	uint256 public immutable totalRaise;
	uint256 public immutable creatorStake;
	uint16 public immutable shareBps;
	uint16 public immutable termMonths;

	uint16[] public trancheBps;
	uint256 public raised;
	uint256 public escrowBalance;
	uint256 public nextTranche;
	uint256 public termEnd;
	bool public ipoInitialized;
	bool public raiseClosed;
	bool public defaulted;
	bool public stakeReclaimed;
	/// @notice Safe-stop flag set by the oracle. Blocks creator-side outflows.
	bool public frozen;
	/// @notice Hedera ATS equity token that mirrors this ISA's cap table (reference only).
	address public atsToken;

	event EscrowFrozen(address indexed by);
	event EscrowUnfrozen(address indexed by);
	event AtsTokenSet(address indexed atsToken);
	event IPOInitialized(address indexed creator, uint256 stake);
	event Invested(address indexed investor, uint256 usdcAmount, uint256 shares);
	event RaiseClosed(uint256 raised);
	event TrancheReleased(uint256 indexed index, uint256 amount);
	event DividendDistributed(address indexed from, uint256 amount);
	event Claimed(address indexed holder, uint256 amount);
	event StakeReclaimed(address indexed creator, uint256 amount);
	event CreatorDefaulted(bytes32 indexed nullifierHash, uint256 refunded, uint256 slashed);

	error NotCreator();
	error NotOracle();
	error AlreadyInitialized();
	error NotInitialized();
	error RaiseIsClosed();
	error RaiseNotClosed();
	error IsDefaulted();
	error ZeroAmount();
	error NoTrancheLeft();
	error NothingToClaim();
	error InvalidTranches();
	error TermNotEnded();
	error StakeAlreadyReclaimed();
	error EscrowFrozenError();
	error AlreadyFrozen();
	error NotFrozen();
	error AtsTokenAlreadySet();

	modifier onlyCreator() {
		if (msg.sender != creator) revert NotCreator();
		_;
	}

	modifier onlyOracle() {
		if (msg.sender != oracle) revert NotOracle();
		_;
	}

	constructor(Params memory p) {
		uint256 sum;
		for (uint256 i; i < p.trancheBps.length; i++) sum += p.trancheBps[i];
		if (p.trancheBps.length == 0 || sum != BPS) revert InvalidTranches();
		if (p.totalRaise == 0) revert ZeroAmount();

		factory = msg.sender;
		usdc = IERC20(p.usdc);
		creator = p.creator;
		oracle = p.oracle;
		worldIdNullifierHash = p.worldIdNullifierHash;
		totalRaise = p.totalRaise;
		creatorStake = p.creatorStake;
		shareBps = p.shareBps;
		termMonths = p.termMonths;
		trancheBps = p.trancheBps;
		token = new CreatorShareToken(p.name, p.ticker, address(this));
	}

	/// @notice Oracle records the ATS (ERC-1400 style) equity token minted for this ISA.
	/// Dividend and escrow math stay in `token`; the ATS token is the regulated registry mirror.
	function setAtsToken(address ats) external onlyOracle {
		if (atsToken != address(0)) revert AtsTokenAlreadySet();
		if (ats == address(0)) revert ZeroAmount();
		atsToken = ats;
		emit AtsTokenSet(ats);
	}

	/// @notice Safe-stop: the oracle freezes tranche releases and creator withdrawals
	/// (for example when a proof deadline is missed). Investor claims and liquidation still work.
	function freezeEscrow() external onlyOracle {
		if (frozen) revert AlreadyFrozen();
		frozen = true;
		emit EscrowFrozen(msg.sender);
	}

	/// @notice The oracle lifts the safe-stop, for example after a late approved proof.
	function unfreezeEscrow() external onlyOracle {
		if (!frozen) revert NotFrozen();
		frozen = false;
		emit EscrowUnfrozen(msg.sender);
	}

	function trancheCount() external view returns (uint256) {
		return trancheBps.length;
	}

	/// @notice The creator locks the USDC stake. Required before anyone can invest.
	function initializeIPO() external onlyCreator nonReentrant {
		if (ipoInitialized) revert AlreadyInitialized();
		ipoInitialized = true;
		if (creatorStake > 0) usdc.safeTransferFrom(msg.sender, address(this), creatorStake);
		emit IPOInitialized(msg.sender, creatorStake);
	}

	/// @notice Buys shares at 1 USDC per share. Amounts above the remaining
	/// capacity are trimmed. Filling the raise releases tranche 0.
	function invest(uint256 usdcAmount) external nonReentrant {
		if (!ipoInitialized) revert NotInitialized();
		if (defaulted) revert IsDefaulted();
		if (raiseClosed) revert RaiseIsClosed();
		uint256 room = totalRaise - raised;
		uint256 amount = usdcAmount > room ? room : usdcAmount;
		if (amount == 0) revert ZeroAmount();

		raised += amount;
		escrowBalance += amount;
		usdc.safeTransferFrom(msg.sender, address(this), amount);
		uint256 shares = amount * SCALE;
		token.mint(msg.sender, shares);
		emit Invested(msg.sender, amount, shares);

		if (raised == totalRaise) _closeAndRelease();
	}

	/// @notice The creator ends the raise early. Tranches resize to the amount raised.
	function closeRaise() external onlyCreator nonReentrant {
		if (!ipoInitialized) revert NotInitialized();
		if (defaulted) revert IsDefaulted();
		if (raiseClosed) revert RaiseIsClosed();
		if (raised == 0) revert ZeroAmount();
		_closeAndRelease();
	}

	/// @notice The oracle releases the next milestone tranche to the creator.
	function unlockNextTranche() external onlyOracle nonReentrant {
		if (defaulted) revert IsDefaulted();
		if (frozen) revert EscrowFrozenError();
		if (!raiseClosed) revert RaiseNotClosed();
		if (nextTranche >= trancheBps.length) revert NoTrancheLeft();
		_releaseTranche();
	}

	/// @notice Anyone deposits USDC to be shared among current token holders. O(1).
	function distributeDividend(uint256 amount) external nonReentrant {
		if (amount == 0) revert ZeroAmount();
		if (defaulted) revert IsDefaulted();
		usdc.safeTransferFrom(msg.sender, address(this), amount);
		token.accrue(amount);
		emit DividendDistributed(msg.sender, amount);
	}

	function withdrawableOf(address holder) external view returns (uint256) {
		return token.withdrawableDividendOf(holder);
	}

	/// @notice Pays out all dividends and refunds owed to the caller.
	function claim() external nonReentrant {
		uint256 amount = token.settle(msg.sender);
		if (amount == 0) revert NothingToClaim();
		usdc.safeTransfer(msg.sender, amount);
		emit Claimed(msg.sender, amount);
	}

	/// @notice Oracle declares default. Remaining escrow and the stake become
	/// pro rata refunds for token holders, and the creator's nullifier is blacklisted.
	function executeLiquidation() external onlyOracle nonReentrant {
		if (defaulted) revert IsDefaulted();
		defaulted = true;

		uint256 refunded = escrowBalance;
		uint256 slashed = ipoInitialized && !stakeReclaimed ? creatorStake : 0;
		escrowBalance = 0;
		stakeReclaimed = true;

		if (token.totalSupply() == 0) {
			// Nobody to refund: the creator keeps the stake.
			if (slashed > 0) usdc.safeTransfer(creator, slashed);
			slashed = 0;
		} else if (refunded + slashed > 0) {
			token.accrue(refunded + slashed);
		}

		IISAFactory(factory).blacklistFromISA(worldIdNullifierHash);
		emit CreatorDefaulted(worldIdNullifierHash, refunded, slashed);
	}

	/// @notice After the term ends without default, the creator takes the stake back.
	function reclaimStake() external onlyCreator nonReentrant {
		if (defaulted) revert IsDefaulted();
		if (frozen) revert EscrowFrozenError();
		if (!raiseClosed || block.timestamp < termEnd) revert TermNotEnded();
		if (stakeReclaimed) revert StakeAlreadyReclaimed();
		stakeReclaimed = true;
		if (creatorStake > 0) usdc.safeTransfer(creator, creatorStake);
		emit StakeReclaimed(creator, creatorStake);
	}

	function _closeAndRelease() internal {
		raiseClosed = true;
		termEnd = block.timestamp + uint256(termMonths) * 30 days;
		emit RaiseClosed(raised);
		// While frozen, tranche 0 waits for the oracle's unlockNextTranche.
		if (!frozen) _releaseTranche();
	}

	function _releaseTranche() internal {
		uint256 index = nextTranche;
		bool last = index == trancheBps.length - 1;
		// The last tranche sweeps rounding dust.
		uint256 amount = last ? escrowBalance : (raised * trancheBps[index]) / BPS;
		nextTranche = index + 1;
		escrowBalance -= amount;
		usdc.safeTransfer(creator, amount);
		emit TrancheReleased(index, amount);
	}
}
