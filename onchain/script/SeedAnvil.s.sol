// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {BuddyNFT} from "../contracts/BuddyNFT.sol";
import {WyHash} from "../contracts/libraries/WyHash.sol";
import {IdentityHash} from "../test/helpers/IdentityHash.sol";

/// @notice Seeds a fresh local anvil deployment with a small curated set of
///         hatched buddies so `/view/<uuid>` has something to render against
///         a dev-mode site. Idempotent — skips any UUID already minted, so
///         re-running after a partial run is safe.
/// @dev Chain 31337 only. Reads the deployed BuddyNFT address from
///      `onchain/deployments/31337.json` (the artifact `extract-deployment.sh`
///      writes after `Deploy.s.sol`). Pair with `tools/seed/seed-anvil.sh`,
///      or invoke directly:
///        forge script script/SeedAnvil.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
///      The UUID list uses the FindSpeciesUuids `00000000-0000-4000-8000-…`
///      sequential pattern (matches RFC 4122 v4 + the site/plugin
///      `isValidUuid` regex). Operators chasing full trait coverage can
///      replace these with `COVERAGE_UUID` hits from
///      `script/FindSpeciesUuids.s.sol`.
contract SeedAnvil is Script {
    uint256 internal constant ANVIL_CHAIN_ID = 31337;
    bytes internal constant HATCH_SALT = "friend-2026-401";

    error WrongChain(uint256 actual);
    error MissingDeployment();

    function run() external {
        if (block.chainid != ANVIL_CHAIN_ID) {
            revert WrongChain(block.chainid);
        }

        string memory deploymentJson = vm.readFile("deployments/31337.json");
        address buddyNftAddr = vm.parseJsonAddress(deploymentJson, ".addresses.BuddyNFT");
        if (buddyNftAddr.code.length == 0) {
            revert MissingDeployment();
        }
        BuddyNFT buddyNft = BuddyNFT(buddyNftAddr);

        string[5] memory uuids = [
            "00000000-0000-4000-8000-000000000001",
            "00000000-0000-4000-8000-000000000002",
            "00000000-0000-4000-8000-000000000003",
            "00000000-0000-4000-8000-000000000004",
            "00000000-0000-4000-8000-000000000005"
        ];

        uint256 deployerPrivateKey = vm.envOr(
            "PRIVATE_KEY",
            // Anvil acct #0 default mnemonic, matching tools/deploy/deploy.sh.
            uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80)
        );

        vm.startBroadcast(deployerPrivateKey);

        uint256 hatched;
        uint256 skipped;
        for (uint256 i = 0; i < uuids.length; ++i) {
            string memory uuid = uuids[i];
            bytes32 identityHash = IdentityHash._computeIdentityHash(uuid);
            uint256 existing = buddyNft.getTokenIdByIdentity(identityHash);
            if (existing != 0) {
                console.log(string.concat("SEED_SKIP ", uuid));
                console.log("  already hatched as tokenId %d", existing);
                ++skipped;
                continue;
            }
            uint256 tokenId = buddyNft.hatch(identityHash, WyHash.hash(bytes(uuid), HATCH_SALT));
            console.log(string.concat("SEED_HATCHED ", uuid));
            console.log("  tokenId=%d", tokenId);
            console.log(string.concat("  /view/", uuid));
            ++hatched;
        }

        vm.stopBroadcast();

        console.log("--- SEED COMPLETE ---");
        console.log("hatched=%d skipped=%d total=%d", hatched, skipped, hatched + skipped);
    }
}
