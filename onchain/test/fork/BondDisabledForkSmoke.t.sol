// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";

import {BuddyNFT} from "../../contracts/BuddyNFT.sol";
import {HatchHelper} from "../helpers/HatchHelper.sol";
import {IBuddyNFT} from "../../contracts/interfaces/IBuddyNFT.sol";

/// @title BondDisabledForkSmoke
/// @notice Bonding-DISABLED launch-posture smoke test against the ACTUALLY DEPLOYED
///         Base Sepolia BuddyNFT. The complement of ClaimForkRehearsal: that one gates
///         the bonding-ENABLED rehearsal; this one asserts the live deploy is still in
///         hatch-only posture — `bondingEnabled == false` and `claim()` reverts
///         `BondingNotEnabled` even on a freshly-hatched token. Re-runnable, zero side
///         effects: the fork forks live, the hatch hits the discarded local fork, and
///         the negative `claim()` reverts before it can mutate anything.
/// @dev    Runnable with ONLY a fork URL — no private keys, no pasted address. The
///         deployed address loads from the `deployments/84532.json` manifest written by
///         deploy.sh (repo source of truth). Skips cleanly (vm.skip) when the RPC env or
///         the manifest is absent, so `forge test` stays green pre-deploy and in CI.
///
///         Drift gate that DOES fire against the live deploy:
///           - bonding must be DISABLED (flips the day prod enables bonding — at which
///             point this test is expected to be retired for ClaimForkRehearsal).
///
///         Env:
///           SEPOLIA_RPC_URL  — Base Sepolia RPC (e.g. https://sepolia.base.org)
///
///         Run: forge test --match-contract BondDisabledForkSmoke -vv
contract BondDisabledForkSmokeTest is Test, HatchHelper {
    using stdJson for string;

    uint256 internal constant BASE_SEPOLIA_CHAIN_ID = 84532;
    string internal constant MANIFEST_PATH = "deployments/84532.json";

    function test_forkSmoke_bondRevertsWhileBondingDisabled() public {
        string memory rpc = vm.envOr("SEPOLIA_RPC_URL", string(""));
        if (bytes(rpc).length == 0 || !vm.exists(MANIFEST_PATH)) {
            emit log("skip: set SEPOLIA_RPC_URL and deploy (deployments/84532.json) to smoke-test the live deploy");
            vm.skip(true);
            return;
        }

        vm.createSelectFork(rpc);
        assertEq(block.chainid, BASE_SEPOLIA_CHAIN_ID, "fork is not Base Sepolia (84532)");

        // Deployed address from the manifest — repo source of truth, zero operator paste.
        address nftAddr = vm.readFile(MANIFEST_PATH).readAddress(".addresses.BuddyNFT");
        require(nftAddr != address(0), "manifest missing .addresses.BuddyNFT");
        BuddyNFT nft = BuddyNFT(nftAddr);

        // Live config snapshot — surfaces deploy/config state for the operator.
        emit log_named_string("live bondingEnabled", nft.bondingEnabled() ? "true" : "false");
        emit log_named_address("live attestationSigner", nft.attestationSigner());

        // The posture gate: the live deploy must still be hatch-only. If this fails, the
        // deploy has been flipped to bonding-enabled and this test should yield to
        // ClaimForkRehearsal.
        assertFalse(nft.bondingEnabled(), "live deploy: bonding is ENABLED (posture flipped)");

        // Hatch a fresh token on the discarded fork so the negative bond targets a real,
        // owned, Custodial token — proving the revert is the bonding gate, not a missing
        // token or wrong stage.
        string memory uuid = _freshUuid(nftAddr);
        require(!nft.isMinted(_identityHash(uuid)), "smoke uuid already minted; rerun");

        uint256 tokenId = _hatchUuid(nft, uuid);
        assertEq(uint8(nft.getStage(tokenId)), uint8(IBuddyNFT.OwnershipStage.Custodial), "hatched stage not Custodial");

        // `bondingEnabled` is the FIRST check in claim() (before identity/provider/name/
        // recipient/expiry/signature), so a well-formed-but-irrelevant attestation still
        // reverts here. expiry in the future keeps the revert unambiguously the bonding gate.
        BuddyNFT.ClaimAttestation memory attestation = BuddyNFT.ClaimAttestation({
            identityHash: _identityHash(uuid),
            prngSeed: _prngSeed(uuid),
            provider: CLAUDE_PROVIDER,
            name: "Smoke",
            recipient: address(this),
            expiry: uint64(block.timestamp + 1 hours)
        });

        vm.expectRevert(BuddyNFT.BondingNotEnabled.selector);
        nft.claim(attestation, "");

        emit log_named_uint("claim reverted BondingNotEnabled on fork, tokenId", tokenId);
    }

    /// @dev Valid RFC 4122 v4 UUID seeded from block + address entropy. Deterministic
    ///      WITHIN a fork block (same block ⇒ same uuid); reruns at a later Sepolia block
    ///      reseed. The isMinted() guard at the call site turns any collision into a loud
    ///      revert, never a false pass.
    function _freshUuid(address salt) internal view returns (string memory) {
        bytes16 rand = bytes16(keccak256(abi.encodePacked(block.timestamp, block.prevrandao, salt)));
        bytes memory hexc = "0123456789abcdef";
        bytes memory out = new bytes(36);
        uint256 nib;
        for (uint256 i = 0; i < 36; ++i) {
            if (i == 8 || i == 13 || i == 18 || i == 23) {
                out[i] = "-";
                continue;
            }
            uint8 b = uint8(rand[nib / 2]);
            uint8 value = (nib % 2 == 0) ? (b >> 4) : (b & 0x0f);
            out[i] = hexc[value];
            ++nib;
        }
        out[14] = "4"; // version nibble
        out[19] = "8"; // variant nibble (one of 8/9/a/b)
        return string(out);
    }
}
