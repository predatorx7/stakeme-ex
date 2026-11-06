// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {LiquidISA} from "./LiquidISA.sol";

/// @notice Deploys one LiquidISA (which deploys its CreatorShareToken) per
/// creator, and enforces one ISA per World ID nullifier plus a default blacklist.
contract LiquidISAFactory {
	address public immutable usdc;
	address public immutable oracle;

	mapping(bytes32 => address) public isaOfNullifier;
	mapping(bytes32 => bool) public blacklisted;
	mapping(address => bool) public isISA;
	address[] public allISAs;

	event ISACreated(address indexed creator, address indexed isa, address token, string ticker);
	event Blacklisted(bytes32 indexed nullifierHash);

	error NotOracle();
	error NotISA();
	error NullifierBlacklisted();
	error NullifierUsed();

	constructor(address usdc_, address oracle_) {
		usdc = usdc_;
		oracle = oracle_;
	}

	function createISA(
		string calldata name,
		string calldata ticker,
		uint256 totalRaise,
		uint256 creatorStake,
		uint16 shareBps,
		uint16 termMonths,
		uint16[] calldata trancheBps,
		bytes32 worldIdNullifierHash
	) external returns (address isa, address token) {
		if (blacklisted[worldIdNullifierHash]) revert NullifierBlacklisted();
		if (isaOfNullifier[worldIdNullifierHash] != address(0)) revert NullifierUsed();

		uint16[] memory tranches = trancheBps;
		if (tranches.length == 0) {
			tranches = new uint16[](3);
			tranches[0] = 2000;
			tranches[1] = 4000;
			tranches[2] = 4000;
		}

		LiquidISA created = new LiquidISA(
			LiquidISA.Params({
				usdc: usdc,
				creator: msg.sender,
				oracle: oracle,
				name: name,
				ticker: ticker,
				totalRaise: totalRaise,
				creatorStake: creatorStake,
				shareBps: shareBps,
				termMonths: termMonths,
				trancheBps: tranches,
				worldIdNullifierHash: worldIdNullifierHash
			})
		);
		isa = address(created);
		token = address(created.token());
		isaOfNullifier[worldIdNullifierHash] = isa;
		isISA[isa] = true;
		allISAs.push(isa);
		emit ISACreated(msg.sender, isa, token, ticker);
	}

	function allISAsLength() external view returns (uint256) {
		return allISAs.length;
	}

	/// @notice Oracle blacklists a nullifier manually.
	function blacklist(bytes32 nullifierHash) external {
		if (msg.sender != oracle) revert NotOracle();
		_blacklist(nullifierHash);
	}

	/// @notice Called by an ISA when it liquidates.
	function blacklistFromISA(bytes32 nullifierHash) external {
		if (!isISA[msg.sender]) revert NotISA();
		_blacklist(nullifierHash);
	}

	function _blacklist(bytes32 nullifierHash) internal {
		blacklisted[nullifierHash] = true;
		emit Blacklisted(nullifierHash);
	}
}
