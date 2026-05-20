// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";

import {BuddyFont} from "../contracts/BuddyFont.sol";
import {BuddyNFT} from "../contracts/BuddyNFT.sol";
import {BuddyRenderer} from "../contracts/BuddyRenderer.sol";
import {BuddySpriteData} from "../contracts/BuddySpriteData.sol";
import {BuddySpriteFont} from "../contracts/BuddySpriteFont.sol";
import {AuthorAttestation} from "../contracts/libraries/AuthorAttestation.sol";

contract Deploy is Script {
    uint256 internal constant BASE_MAINNET_CHAIN_ID = 8453;

    error AuthorAttestationSignerUnset();

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        validateDeploymentGuards();

        // Single reads keep local dry runs and Base Sepolia broadcasts on the same committed payload bytes.
        bytes memory buddyFontPayload = vm.readFileBinary("contract-data/fonts/chrome/BuddyFont.woff2");
        bytes memory spriteFontPayload = vm.readFileBinary("contract-data/fonts/sprite/BuddySpriteFont.woff2");

        vm.startBroadcast(deployerPrivateKey);

        BuddySpriteData spriteData = new BuddySpriteData();
        BuddyFont buddyFont = new BuddyFont(buddyFontPayload);
        BuddySpriteFont buddySpriteFont = new BuddySpriteFont(spriteFontPayload);
        BuddyRenderer renderer = new BuddyRenderer(address(spriteData), address(buddyFont), address(buddySpriteFont));
        BuddyNFT buddyNft = new BuddyNFT(deployer, address(0));

        buddyNft.setRenderer(address(renderer));

        vm.stopBroadcast();

        console.log("Deployment summary");
        console.log("  Deployer:", deployer);
        console.log("  BuddyNFT:", address(buddyNft));
        console.log("  BuddyFont:", address(buddyFont));
        console.log("  BuddySpriteFont:", address(buddySpriteFont));
        console.log("  BuddySpriteData:", address(spriteData));
        console.log("  BuddyRenderer:", address(renderer));
    }

    function validateDeploymentGuards() public view {
        if (block.chainid == BASE_MAINNET_CHAIN_ID && AuthorAttestation.SIGNER == address(0)) {
            revert AuthorAttestationSignerUnset();
        }
    }
}
