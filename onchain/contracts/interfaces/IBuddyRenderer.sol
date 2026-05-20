// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IBuddyRenderer {
    function tokenURI(address buddyNft, uint256 tokenId) external view returns (string memory);
}
