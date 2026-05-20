// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IBuddyNFT} from "../contracts/interfaces/IBuddyNFT.sol";
import {Script, console} from "forge-std/Script.sol";
import {BuddyFont} from "../contracts/BuddyFont.sol";
import {BuddyRenderer} from "../contracts/BuddyRenderer.sol";
import {BuddySpriteData} from "../contracts/BuddySpriteData.sol";
import {BuddySpriteFont} from "../contracts/BuddySpriteFont.sol";
import {MockBuddyNFTForRenderer} from "../test/helpers/MockBuddyNFTForRenderer.sol";

/// @notice Emits the canonical reference-card suite: one card per rarity,
///         alternating hat / hatless. Output is committed under
///         `onchain/contract-data/reference-cards/` and serves as the permanent
///         visual-truth reference for renderer output.
/// @dev Runs entirely in forge's in-memory EVM. Deterministic by construction:
///      trait tuples, names, identity hashes, and stages are pinned so
///      byte-identical regeneration is possible whenever the renderer changes.
///      Consumed by `onchain/tools/renderer/regen-reference-cards.sh`.
contract GenerateReferenceCards is Script {
    function run() external {
        BuddyFont buddyFont = new BuddyFont(vm.readFileBinary("contract-data/fonts/chrome/BuddyFont.woff2"));
        BuddySpriteFont buddySpriteFont = new BuddySpriteFont(vm.readFileBinary("contract-data/fonts/sprite/BuddySpriteFont.woff2"));
        BuddySpriteData spriteData = new BuddySpriteData();
        BuddyRenderer renderer = new BuddyRenderer(address(spriteData), address(buddyFont), address(buddySpriteFont));
        MockBuddyNFTForRenderer mock = new MockBuddyNFTForRenderer();

        uint256 tokenId = 1;

        // Common / Duck / beanie — baseline 4-row species with hat.
        tokenId = _emitCard(
            renderer,
            mock,
            tokenId,
            "common-duck-hat",
            "Common / Duck / Beanie",
            _traits(0, 0, 0, 6, false, 12, 28, 15, 32, 20),
            "",
            keccak256("reference-card:common-duck-hat"),
            IBuddyNFT.OwnershipStage.Custodial
        );

        // Uncommon / Mushroom / hatless — row-0 reservation edge; mushroom
        // is one of the canonical hatless species.
        tokenId = _emitCard(
            renderer,
            mock,
            tokenId,
            "uncommon-mushroom-hatless",
            "Uncommon / Mushroom / Hatless",
            _traits(16, 1, 1, 0, false, 22, 44, 38, 27, 31),
            "",
            keccak256("reference-card:uncommon-mushroom-hatless"),
            IBuddyNFT.OwnershipStage.Custodial
        );

        // Rare / Axolotl / tophat — mid-rarity with bullseye eyes.
        tokenId = _emitCard(
            renderer,
            mock,
            tokenId,
            "rare-axolotl-hat",
            "Rare / Axolotl / Tophat",
            _traits(11, 2, 3, 2, false, 48, 62, 35, 54, 41),
            "",
            keccak256("reference-card:rare-axolotl-hat"),
            IBuddyNFT.OwnershipStage.Custodial
        );

        // Epic / Dragon / wizard hat — full 5-row layout with largest stat bar.
        tokenId = _emitCard(
            renderer,
            mock,
            tokenId,
            "epic-dragon-hat",
            "Epic / Dragon / Wizard",
            _traits(4, 3, 4, 5, false, 78, 45, 88, 62, 38),
            "",
            keccak256("reference-card:epic-dragon-hat"),
            IBuddyNFT.OwnershipStage.Custodial
        );

        // Legendary / Ghost / hatless / shiny — legendary chrome + shiny glow.
        tokenId = _emitCard(
            renderer,
            mock,
            tokenId,
            "legendary-ghost-hatless",
            "Legendary / Ghost / Hatless / Shiny",
            _traits(10, 4, 2, 0, true, 92, 58, 74, 88, 66),
            "",
            keccak256("reference-card:legendary-ghost-hatless"),
            IBuddyNFT.OwnershipStage.Custodial
        );

        console.log("--- REFERENCE CARDS COMPLETE ---");
        console.log("Total cards: %d", tokenId - 1);
    }

    function _emitCard(
        BuddyRenderer renderer,
        MockBuddyNFTForRenderer mock,
        uint256 tokenId,
        string memory slug,
        string memory label,
        IBuddyNFT.BuddyTraits memory traits,
        string memory name,
        bytes32 identityHash,
        IBuddyNFT.OwnershipStage stage
    )
        internal
        returns (uint256)
    {
        mock.setTraits(tokenId, traits);
        mock.setName(tokenId, name);
        mock.setIdentityHash(tokenId, identityHash);
        mock.setPrngSeed(tokenId, uint32(uint256(identityHash)));
        mock.setStage(tokenId, stage);

        string memory uri = renderer.tokenURI(address(mock), tokenId);

        console.log(string.concat("REFERENCE_CARD ", slug, "|", label));
        console.log(string.concat("REFERENCE_URI ", uri));

        return tokenId + 1;
    }

    function _traits(
        uint8 species,
        uint8 rarity,
        uint8 eyes,
        uint8 hat,
        bool shiny,
        uint8 debugging,
        uint8 patience,
        uint8 chaos,
        uint8 wisdom,
        uint8 snark
    )
        internal
        pure
        returns (IBuddyNFT.BuddyTraits memory)
    {
        return IBuddyNFT.BuddyTraits({
            species: species,
            rarity: rarity,
            eyes: eyes,
            hat: hat,
            shiny: shiny,
            debugging: debugging,
            patience: patience,
            chaos: chaos,
            wisdom: wisdom,
            snark: snark
        });
    }
}
