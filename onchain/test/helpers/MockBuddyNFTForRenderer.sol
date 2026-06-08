// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IBuddyNFT} from "../../contracts/interfaces/IBuddyNFT.sol";

contract MockBuddyNFTForRenderer is IBuddyNFT {
    mapping(uint256 tokenId => IBuddyNFT.BuddyTraits) private _traits;
    mapping(uint256 tokenId => string) private _names;
    mapping(uint256 tokenId => bytes32) private _identityHashes;
    mapping(uint256 tokenId => uint32) private _prngSeeds;
    mapping(uint256 tokenId => IBuddyNFT.OwnershipStage) private _stages;

    function setTraits(uint256 tokenId, IBuddyNFT.BuddyTraits calldata traits_) external {
        _traits[tokenId] = traits_;
    }

    function setName(uint256 tokenId, string calldata name_) external {
        _names[tokenId] = name_;
    }

    function setIdentityHash(uint256 tokenId, bytes32 identityHash_) external {
        _identityHashes[tokenId] = identityHash_;
    }

    function setPrngSeed(uint256 tokenId, uint32 prngSeed_) external {
        _prngSeeds[tokenId] = prngSeed_;
    }

    function setStage(uint256 tokenId, IBuddyNFT.OwnershipStage stage_) external {
        _stages[tokenId] = stage_;
    }

    function buddyTraits(uint256 tokenId) external view override returns (IBuddyNFT.BuddyTraits memory) {
        return _traits[tokenId];
    }

    function buddyName(uint256 tokenId) external view override returns (string memory) {
        return _names[tokenId];
    }

    function buddyIdentityHash(uint256 tokenId) external view override returns (bytes32) {
        return _identityHashes[tokenId];
    }

    function buddyPrngSeed(uint256 tokenId) external view override returns (uint32) {
        return _prngSeeds[tokenId];
    }

    function getStage(uint256 tokenId) external view override returns (IBuddyNFT.OwnershipStage) {
        return _stages[tokenId];
    }
}
