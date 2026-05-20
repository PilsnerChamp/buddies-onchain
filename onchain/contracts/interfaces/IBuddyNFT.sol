// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IBuddyNFT {
    enum OwnershipStage {
        Custodial,
        Bonded
    }

    struct BuddyTraits {
        uint8 species;
        uint8 rarity;
        uint8 eyes;
        uint8 hat;
        bool shiny;
        uint8 debugging;
        uint8 patience;
        uint8 chaos;
        uint8 wisdom;
        uint8 snark;
    }

    function buddyTraits(uint256 tokenId) external view returns (BuddyTraits memory);
    function buddyName(uint256 tokenId) external view returns (string memory);
    function buddyIdentityHash(uint256 tokenId) external view returns (bytes32);
    function getStage(uint256 tokenId) external view returns (OwnershipStage);
}
