// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IBuddyNFT} from "../contracts/interfaces/IBuddyNFT.sol";
import {Script, console} from "forge-std/Script.sol";
import {BuddyFont} from "../contracts/BuddyFont.sol";
import {BuddyRenderer} from "../contracts/BuddyRenderer.sol";
import {BuddySpriteData} from "../contracts/BuddySpriteData.sol";
import {BuddySpriteFont} from "../contracts/BuddySpriteFont.sol";
import {BuddyDomain} from "../contracts/libraries/BuddyDomain.sol";
import {MockBuddyNFTForRenderer} from "../test/helpers/MockBuddyNFTForRenderer.sol";

/// @notice Generates base64-encoded SVGs for a coverage matrix of synthetic traits.
contract GenerateSpriteSheet is Script {
    function run() external {
        BuddyFont buddyFont = new BuddyFont(vm.readFileBinary("contract-data/fonts/chrome/BuddyFont.woff2"));
        BuddySpriteFont buddySpriteFont = new BuddySpriteFont(vm.readFileBinary("contract-data/fonts/sprite/BuddySpriteFont.woff2"));
        BuddySpriteData spriteData = new BuddySpriteData();
        BuddyRenderer renderer = new BuddyRenderer(address(spriteData), address(buddyFont), address(buddySpriteFont));
        MockBuddyNFTForRenderer mock = new MockBuddyNFTForRenderer();

        uint256 tokenId = 1;

        for (uint8 species = 0; species < BuddyDomain.SPECIES_COUNT; ++species) {
            for (uint8 rarity = 0; rarity < BuddyDomain.RARITY_COUNT; ++rarity) {
                uint8 hat = rarity == 0 ? 0 : 3;
                bytes32 identityHash = keccak256(abi.encodePacked("sprite", species, rarity));

                mock.setTraits(tokenId, IBuddyNFT.BuddyTraits({
                    species: species, rarity: rarity, eyes: 0, hat: hat, shiny: false,
                    debugging: 50, patience: 50, chaos: 50, wisdom: 50, snark: 50
                }));
                mock.setName(tokenId, "");
                mock.setIdentityHash(tokenId, identityHash);
                mock.setPrngSeed(tokenId, uint32(uint256(identityHash)));
                mock.setStage(tokenId, IBuddyNFT.OwnershipStage.Custodial);

                string memory uri = renderer.tokenURI(address(mock), tokenId);
                console.log(
                    string.concat(
                        "SPRITE_ROW species=", _u8(species),
                        " rarity=", _u8(rarity),
                        " eyes=0 hat=", _u8(hat),
                        " shiny=false variant=base"
                    )
                );
                console.log(string.concat("SPRITE_URI ", uri));

                ++tokenId;
            }
        }

        uint8[2] memory eyeSpecies = [uint8(0), uint8(14)];
        for (uint256 s = 0; s < 2; ++s) {
            for (uint8 eye = 0; eye < BuddyDomain.EYE_COUNT; ++eye) {
                bytes32 identityHash = keccak256(abi.encodePacked("eye", eyeSpecies[s], eye));

                mock.setTraits(tokenId, IBuddyNFT.BuddyTraits({
                    species: eyeSpecies[s], rarity: 2, eyes: eye, hat: 3, shiny: false,
                    debugging: 50, patience: 50, chaos: 50, wisdom: 50, snark: 50
                }));
                mock.setName(tokenId, "");
                mock.setIdentityHash(tokenId, identityHash);
                mock.setPrngSeed(tokenId, uint32(uint256(identityHash)));
                mock.setStage(tokenId, IBuddyNFT.OwnershipStage.Custodial);

                string memory uri = renderer.tokenURI(address(mock), tokenId);
                console.log(
                    string.concat(
                        "SPRITE_ROW species=", _u8(eyeSpecies[s]),
                        " rarity=2 eyes=", _u8(eye),
                        " hat=3 shiny=false variant=eye"
                    )
                );
                console.log(string.concat("SPRITE_URI ", uri));

                ++tokenId;
            }
        }

        uint8[2] memory hatSpecies = [uint8(5), uint8(11)];
        for (uint256 s = 0; s < 2; ++s) {
            for (uint8 h = 0; h < BuddyDomain.HAT_COUNT; ++h) {
                bytes32 identityHash = keccak256(abi.encodePacked("hat", hatSpecies[s], h));

                mock.setTraits(tokenId, IBuddyNFT.BuddyTraits({
                    species: hatSpecies[s], rarity: 1, eyes: 0, hat: h, shiny: false,
                    debugging: 50, patience: 50, chaos: 50, wisdom: 50, snark: 50
                }));
                mock.setName(tokenId, "");
                mock.setIdentityHash(tokenId, identityHash);
                mock.setPrngSeed(tokenId, uint32(uint256(identityHash)));
                mock.setStage(tokenId, IBuddyNFT.OwnershipStage.Custodial);

                string memory uri = renderer.tokenURI(address(mock), tokenId);
                console.log(
                    string.concat(
                        "SPRITE_ROW species=", _u8(hatSpecies[s]),
                        " rarity=1 eyes=0 hat=", _u8(h),
                        " shiny=false variant=hat"
                    )
                );
                console.log(string.concat("SPRITE_URI ", uri));

                ++tokenId;
            }
        }

        uint8[2] memory shinySpecies = [uint8(4), uint8(10)];
        for (uint256 s = 0; s < 2; ++s) {
            bytes32 identityHash = keccak256(abi.encodePacked("shiny", shinySpecies[s]));

            mock.setTraits(tokenId, IBuddyNFT.BuddyTraits({
                species: shinySpecies[s], rarity: 3, eyes: 0, hat: 5, shiny: true,
                debugging: 80, patience: 60, chaos: 90, wisdom: 70, snark: 40
            }));
            mock.setName(tokenId, "");
            mock.setIdentityHash(tokenId, identityHash);
            mock.setPrngSeed(tokenId, uint32(uint256(identityHash)));
            mock.setStage(tokenId, IBuddyNFT.OwnershipStage.Custodial);

            string memory uri = renderer.tokenURI(address(mock), tokenId);
            console.log(
                string.concat(
                    "SPRITE_ROW species=", _u8(shinySpecies[s]),
                    " rarity=3 eyes=0 hat=5 shiny=true variant=shiny"
                )
            );
            console.log(string.concat("SPRITE_URI ", uri));

            ++tokenId;
        }

        console.log("--- SPRITE SHEET COMPLETE ---");
        console.log("Total cards: %d", tokenId - 1);
    }

    function _u8(uint8 v) internal pure returns (string memory) {
        uint8 asciiZero = uint8(BuddyDomain.ASCII_DIGIT_0);
        if (v < 10) return string(abi.encodePacked(bytes1(asciiZero + v)));
        return string(abi.encodePacked(bytes1(asciiZero + v / 10), bytes1(asciiZero + v % 10)));
    }
}
