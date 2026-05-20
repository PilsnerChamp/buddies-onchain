// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IBuddyNFT} from "../contracts/interfaces/IBuddyNFT.sol";
import {Script, console} from "forge-std/Script.sol";
import {BuddyFont} from "../contracts/BuddyFont.sol";
import {BuddyRenderer} from "../contracts/BuddyRenderer.sol";
import {BuddySpriteData} from "../contracts/BuddySpriteData.sol";
import {BuddySpriteFont} from "../contracts/BuddySpriteFont.sol";
import {MockBuddyNFTForRenderer} from "../test/helpers/MockBuddyNFTForRenderer.sol";

/// @notice Emits a small curated set of renderer-only cards for fast visual iteration.
/// @dev Runs entirely in forge's local in-memory EVM. No Anvil, no BuddyNFT deployment,
///      no hatch flow. Output is consumed by `onchain/tools/renderer/renderer-playground.sh`.
contract GenerateRendererPlayground is Script {
    function run() external {
        BuddyFont buddyFont = new BuddyFont(vm.readFileBinary("contract-data/fonts/chrome/BuddyFont.woff2"));
        BuddySpriteFont buddySpriteFont = new BuddySpriteFont(vm.readFileBinary("contract-data/fonts/sprite/BuddySpriteFont.woff2"));
        BuddySpriteData spriteData = new BuddySpriteData();
        BuddyRenderer renderer = new BuddyRenderer(address(spriteData), address(buddyFont), address(buddySpriteFont));
        MockBuddyNFTForRenderer mock = new MockBuddyNFTForRenderer();

        uint256 tokenId = 1;

        tokenId = _emitCard(
            renderer,
            mock,
            tokenId,
            "hero",
            "axolotl-legendary",
            "Axolotl hero / Legendary / Hatched",
            _traits(11, 4, 0, 7, false, 72, 68, 40, 84, 58),
            "",
            bytes32(uint256(0xA110)),
            IBuddyNFT.OwnershipStage.Custodial
        );

        tokenId = _emitCard(
            renderer,
            mock,
            tokenId,
            "centering",
            "duck-common",
            "Duck / Common / Hatched",
            _traits(0, 0, 0, 0, false, 50, 50, 50, 50, 50),
            "",
            bytes32(uint256(0xD001)),
            IBuddyNFT.OwnershipStage.Custodial
        );

        tokenId = _emitCard(
            renderer,
            mock,
            tokenId,
            "centering",
            "dragon-epic",
            "Dragon / Epic / Hatched",
            _traits(4, 3, 4, 5, false, 80, 44, 91, 61, 37),
            "",
            bytes32(uint256(0xD402)),
            IBuddyNFT.OwnershipStage.Custodial
        );

        tokenId = _emitCard(
            renderer,
            mock,
            tokenId,
            "centering",
            "robot-rare",
            "Robot / Rare / Hatched",
            _traits(14, 2, 5, 3, false, 46, 61, 30, 95, 58),
            "",
            bytes32(uint256(0xD143)),
            IBuddyNFT.OwnershipStage.Custodial
        );

        tokenId = _emitCard(
            renderer,
            mock,
            tokenId,
            "centering",
            "octopus-uncommon",
            "Octopus / Uncommon / Hatched",
            _traits(5, 1, 1, 2, false, 57, 49, 72, 66, 35),
            "",
            bytes32(uint256(0xD584)),
            IBuddyNFT.OwnershipStage.Custodial
        );

        tokenId = _emitCard(
            renderer,
            mock,
            tokenId,
            "eyes",
            "duck-star-eyes",
            "Duck / Rare / star eyes",
            _traits(0, 2, 1, 3, false, 50, 50, 50, 50, 50),
            "",
            bytes32(uint256(0xE011)),
            IBuddyNFT.OwnershipStage.Custodial
        );

        tokenId = _emitCard(
            renderer,
            mock,
            tokenId,
            "eyes",
            "duck-bullseye-eyes",
            "Duck / Rare / bullseye eyes",
            _traits(0, 2, 3, 3, false, 50, 50, 50, 50, 50),
            "",
            bytes32(uint256(0xE033)),
            IBuddyNFT.OwnershipStage.Custodial
        );

        tokenId = _emitCard(
            renderer,
            mock,
            tokenId,
            "eyes",
            "duck-at-eyes",
            "Duck / Rare / at eyes",
            _traits(0, 2, 4, 3, false, 50, 50, 50, 50, 50),
            "",
            bytes32(uint256(0xE044)),
            IBuddyNFT.OwnershipStage.Custodial
        );

        tokenId = _emitCard(
            renderer,
            mock,
            tokenId,
            "stats",
            "low-bars",
            "Ghost / Uncommon / low stats",
            _traits(10, 1, 0, 3, false, 8, 14, 12, 18, 10),
            "",
            bytes32(uint256(0x5101)),
            IBuddyNFT.OwnershipStage.Custodial
        );

        tokenId = _emitCard(
            renderer,
            mock,
            tokenId,
            "stats",
            "balanced-bars",
            "Cat / Rare / balanced stats",
            _traits(3, 2, 0, 3, false, 52, 57, 46, 61, 55),
            "",
            bytes32(uint256(0x5202)),
            IBuddyNFT.OwnershipStage.Custodial
        );

        tokenId = _emitCard(
            renderer,
            mock,
            tokenId,
            "stats",
            "maxed-bars",
            "Dragon / Legendary / maxed stats",
            _traits(4, 4, 0, 6, false, 100, 100, 100, 100, 100),
            "",
            bytes32(uint256(0x5303)),
            IBuddyNFT.OwnershipStage.Custodial
        );

        tokenId = _emitCard(
            renderer,
            mock,
            tokenId,
            "polish",
            "shiny-ghost",
            "Ghost / Epic / shiny",
            _traits(10, 3, 2, 4, true, 84, 38, 92, 70, 66),
            "",
            bytes32(uint256(0x6104)),
            IBuddyNFT.OwnershipStage.Custodial
        );

        tokenId = _emitCard(
            renderer,
            mock,
            tokenId,
            "polish",
            "bonded-stage",
            "Robot / Rare / Bonded stage",
            _traits(14, 2, 5, 3, false, 46, 61, 30, 95, 58),
            "Pilsner",
            bytes32(uint256(0x6205)),
            IBuddyNFT.OwnershipStage.Bonded
        );

        console.log("--- RENDERER PLAYGROUND COMPLETE ---");
        console.log("Total cards: %d", tokenId - 1);
    }

    function _emitCard(
        BuddyRenderer renderer,
        MockBuddyNFTForRenderer mock,
        uint256 tokenId,
        string memory section,
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

        console.log(string.concat("PLAYGROUND_CARD ", section, "|", slug, "|", label));
        console.log(string.concat("PLAYGROUND_URI ", uri));

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
