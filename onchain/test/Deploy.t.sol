// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {BuddyNFT} from "../contracts/BuddyNFT.sol";
import {Deploy} from "../script/Deploy.s.sol";

contract DeployTest is Test {
    uint256 internal constant BASE_MAINNET_CHAIN_ID = 8453;
    uint256 internal constant BASE_SEPOLIA_CHAIN_ID = 84532;

    function test_mainnetDeploymentGuardAllowsConfiguredAuthorAttestationSigner() public {
        Deploy deploy = new Deploy();
        BuddyNFT nft = new BuddyNFT(address(this), address(0));

        vm.chainId(BASE_MAINNET_CHAIN_ID);

        assertNotEq(nft.AUTHOR_ATTESTATION_SIGNER(), address(0));

        deploy.validateDeploymentGuards();
    }

    function test_sepoliaDeploymentGuardAllowsPlaceholderAuthorAttestationSigner() public {
        Deploy deploy = new Deploy();

        vm.chainId(BASE_SEPOLIA_CHAIN_ID);

        deploy.validateDeploymentGuards();
    }
}
