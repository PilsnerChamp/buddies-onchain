// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IBuddyNFT} from "../contracts/interfaces/IBuddyNFT.sol";
import {Script, console} from "forge-std/Script.sol";
import {BuddyFont} from "../contracts/BuddyFont.sol";
import {BuddyRenderer} from "../contracts/BuddyRenderer.sol";
import {BuddySpriteData} from "../contracts/BuddySpriteData.sol";
import {BuddySpriteFont} from "../contracts/BuddySpriteFont.sol";
import {MockBuddyNFTForRenderer} from "../test/helpers/MockBuddyNFTForRenderer.sol";

/// @notice Emits one renderer-only card for tight visual iteration.
contract GenerateRendererCard is Script {
    function run() external {
        uint256 preset = vm.envUint("RENDERER_CARD_PRESET");

        BuddyFont buddyFont = new BuddyFont(vm.readFileBinary("contract-data/fonts/chrome/BuddyFont.woff2"));
        BuddySpriteFont buddySpriteFont =
            new BuddySpriteFont(vm.readFileBinary("contract-data/fonts/sprite/BuddySpriteFont.woff2"));
        BuddySpriteData spriteData = new BuddySpriteData();
        BuddyRenderer renderer = new BuddyRenderer(address(spriteData), address(buddyFont), address(buddySpriteFont));
        MockBuddyNFTForRenderer mock = new MockBuddyNFTForRenderer();

        (
            string memory slug,
            string memory label,
            IBuddyNFT.BuddyTraits memory traits,
            string memory name,
            uint32 prngSeed,
            IBuddyNFT.OwnershipStage stage
        ) = _preset(preset);

        mock.setTraits(1, traits);
        mock.setName(1, name);
        mock.setIdentityHash(1, keccak256(abi.encodePacked("renderer-card-identity:", slug)));
        mock.setPrngSeed(1, prngSeed);
        mock.setStage(1, stage);
        // v1 plugin provider; without this the mock returns bytes16(0), which
        // trims to "" — an on-chain-impossible value the validator rejects.
        mock.setProvider(1, "claude");

        console.log(string.concat("RENDERER_CARD ", slug, "|", label));
        console.log(string.concat("RENDERER_URI ", renderer.tokenURI(address(mock), 1)));
    }

    function _preset(uint256 preset)
        internal
        pure
        returns (
            string memory slug,
            string memory label,
            IBuddyNFT.BuddyTraits memory traits,
            string memory name,
            uint32 prngSeed,
            IBuddyNFT.OwnershipStage stage
        )
    {
        if (preset == 0) {
            return (
                "duck-common",
                "Duck / Common / Hatched",
                _traits(0, 0, 0, 0, false, 50, 50, 50, 50, 50),
                "",
                uint32(0xD001),
                IBuddyNFT.OwnershipStage.Custodial
            );
        }

        if (preset == 1) {
            return (
                "axolotl-legendary",
                "Axolotl / Legendary / Hatched",
                _traits(11, 4, 0, 7, false, 72, 68, 40, 84, 58),
                "",
                uint32(0xA110),
                IBuddyNFT.OwnershipStage.Custodial
            );
        }

        if (preset == 2) {
            return (
                "dragon-epic",
                "Dragon / Epic / Hatched",
                _traits(4, 3, 4, 5, false, 80, 44, 91, 61, 37),
                "",
                uint32(0xD402),
                IBuddyNFT.OwnershipStage.Custodial
            );
        }

        if (preset == 3) {
            return (
                "robot-rare-bonded",
                "Robot / Rare / Bonded",
                _traits(14, 2, 5, 3, false, 46, 61, 30, 95, 58),
                "Pilsner",
                uint32(0x6205),
                IBuddyNFT.OwnershipStage.Bonded
            );
        }

        if (preset == 4) {
            return (
                "axolotl-single-digit",
                "Axolotl / Legendary / Hatched / Single Digit",
                _traits(11, 4, 0, 7, false, 72, 68, 7, 84, 58),
                "",
                uint32(0xA117),
                IBuddyNFT.OwnershipStage.Custodial
            );
        }

        if (preset == 5) {
            return (
                "axolotl-hundred",
                "Axolotl / Legendary / Hatched / Hundred",
                _traits(11, 4, 0, 7, false, 72, 68, 100, 84, 58),
                "",
                uint32(0xA199),
                IBuddyNFT.OwnershipStage.Custodial
            );
        }

        if (preset == 6) {
            return (
                "mushroom-shiny-legendary",
                "Mushroom / Legendary / Hatched / Shiny",
                _traits(16, 4, 1, 0, true, 100, 54, 89, 88, 87),
                "",
                uint32(0xD16A),
                IBuddyNFT.OwnershipStage.Custodial
            );
        }

        revert("unknown renderer card preset");
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
    ) internal pure returns (IBuddyNFT.BuddyTraits memory) {
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
