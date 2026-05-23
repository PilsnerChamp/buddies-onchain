// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";
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

    struct Deployment {
        BuddyNFT nft;
        BuddyRenderer renderer;
        BuddySpriteData spriteData;
        BuddyFont buddyFont;
        BuddySpriteFont buddySpriteFont;
    }

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        validateDeploymentGuards();

        vm.startBroadcast(deployerPrivateKey);
        Deployment memory d = deployAll(deployer);
        vm.stopBroadcast();

        console.log("Deployment summary");
        console.log("  Deployer:", deployer);
        console.log("  BuddyNFT:", address(d.nft));
        console.log("  BuddyFont:", address(d.buddyFont));
        console.log("  BuddySpriteFont:", address(d.buddySpriteFont));
        console.log("  BuddySpriteData:", address(d.spriteData));
        console.log("  BuddyRenderer:", address(d.renderer));
    }

    function deployAll(address owner) public returns (Deployment memory) {
        // Single reads keep local dry runs and Base Sepolia broadcasts on the same committed payload bytes.
        bytes memory buddyFontPayload = vm.readFileBinary("contract-data/fonts/chrome/BuddyFont.woff2");
        bytes memory spriteFontPayload = vm.readFileBinary("contract-data/fonts/sprite/BuddySpriteFont.woff2");

        BuddySpriteData spriteData = new BuddySpriteData();
        BuddyFont buddyFont = new BuddyFont(buddyFontPayload);
        BuddySpriteFont buddySpriteFont = new BuddySpriteFont(spriteFontPayload);
        BuddyRenderer renderer = new BuddyRenderer(address(spriteData), address(buddyFont), address(buddySpriteFont));
        BuddyNFT buddyNft = new BuddyNFT(owner, address(0));

        // Direct test calls are not broadcast, so the script contract would otherwise be msg.sender.
        (VmSafe.CallerMode callerMode,,) = vm.readCallers();
        if (callerMode != VmSafe.CallerMode.Broadcast && callerMode != VmSafe.CallerMode.RecurrentBroadcast) {
            vm.prank(owner);
        }
        buddyNft.setRenderer(address(renderer));

        return Deployment({
            nft: buddyNft,
            renderer: renderer,
            spriteData: spriteData,
            buddyFont: buddyFont,
            buddySpriteFont: buddySpriteFont
        });
    }

    function validateDeploymentGuards() public view {
        if (block.chainid == BASE_MAINNET_CHAIN_ID && AuthorAttestation.SIGNER == address(0)) {
            revert AuthorAttestationSignerUnset();
        }
    }
}
