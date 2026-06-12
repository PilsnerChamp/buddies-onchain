// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";

import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

import {BuddyNFT} from "../../contracts/BuddyNFT.sol";
import {IBuddyNFT} from "../../contracts/interfaces/IBuddyNFT.sol";
import {BondAttestationHelper} from "../helpers/BondAttestationHelper.sol";
import {SvgDecode} from "../helpers/SvgDecode.sol";
import {HatchHelper} from "../helpers/HatchHelper.sol";

/// @title BondForkRehearsal
/// @notice Dress rehearsal of the bond + render flip against the ACTUALLY DEPLOYED
///         Base Sepolia BuddyNFT. Real reads (deployed bytecode, live owner/signer/
///         bonding config, forked chainId 84532, real trait derivation + renderer);
///         all writes hit the local fork and are discarded — no gas, no persistent
///         token. Catches deploy/config drift the hermetic suite cannot.
/// @dev    Runnable with ONLY a fork URL — no private keys, no pasted address. The
///         deployed address loads from the `deployments/84532.json` manifest written
///         by deploy.sh (repo source of truth), and the signer is repointed locally
///         via an owner prank, so we sign with a local key. Skips cleanly (vm.skip)
///         when the RPC env or the manifest is absent, so `forge test` stays green
///         pre-deploy and in CI.
///
///         Drift gates that DO fire against the live deploy (pre-override):
///           - bonding must be enabled
///           - an attestation signer must be set (identity checked separately, §3)
///
///         Env:
///           SEPOLIA_RPC_URL  — Base Sepolia RPC (e.g. https://sepolia.base.org)
///
///         Run: forge test --match-contract BondForkRehearsal -vv
contract BondForkRehearsalTest is Test, HatchHelper {
    using stdJson for string;

    uint256 internal constant BASE_SEPOLIA_CHAIN_ID = 84532;
    string internal constant MANIFEST_PATH = "deployments/84532.json";
    string internal constant BOND_NAME = "ForkRehearsal";

    function test_forkRehearsal_bondFlipAgainstLiveDeploy() public {
        string memory rpc = vm.envOr("SEPOLIA_RPC_URL", string(""));
        if (bytes(rpc).length == 0 || !vm.exists(MANIFEST_PATH)) {
            emit log("skip: set SEPOLIA_RPC_URL and deploy (deployments/84532.json) to rehearse against the live deploy");
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
        address owner = nft.owner();
        emit log_named_address("live owner", owner);
        emit log_named_address("live attestationSigner", nft.attestationSigner());
        emit log_named_string("live bondingEnabled", nft.bondingEnabled() ? "true" : "false");
        emit log_named_address("live renderer", nft.renderer());

        // Config-drift gates the hermetic suite cannot see: assert the live deploy is
        // actually bond-ready BEFORE we override anything locally. Exact signer identity
        // is a separate operator concern (rig A repoints it post-deploy to a throwaway),
        // validated authoritatively by the §3 broadcast preflight.
        assertTrue(nft.bondingEnabled(), "live deploy: bonding not enabled");
        assertTrue(nft.attestationSigner() != address(0), "live deploy: attestationSigner unset");

        // Repoint signer locally on the fork (owner prank, no key). This rehearses the
        // bond MECHANICS against real bytecode + traits; the digest binds chainId +
        // verifyingContract + fields, so a local signer stays faithful.
        uint256 localSignerPk = uint256(keccak256("fork-rehearsal-signer"));
        vm.prank(owner);
        nft.setAttestationSigner(vm.addr(localSignerPk));

        // Fresh v4 UUID so we never collide with a token already minted on-chain.
        string memory uuid = _freshUuid(nftAddr);
        require(!nft.isMinted(_identityHash(uuid)), "rehearsal uuid already minted; rerun");

        uint256 tokenId = _hatchUuid(nft, uuid);
        assertEq(uint8(nft.getStage(tokenId)), uint8(IBuddyNFT.OwnershipStage.Custodial), "hatched stage not Custodial");

        string memory preJson = SvgDecode.decodeJson(nft.tokenURI(tokenId));
        assertEq(preJson.readString(".attributes[5].value"), "Hatched", "pre-bond Stage must be Hatched");

        address recipient = makeAddr("fork-rehearsal-recipient");
        // prngSeed is UUID-derived (signer-spec invariant), never read back from
        // chain state. Requires the seed-aware (Decision-10) bytecode on the live
        // deploy — against the older seedless deploy this call fails on selector.
        BuddyNFT.BondAttestation memory attestation = BuddyNFT.BondAttestation({
            tokenId: tokenId,
            identityHash: _identityHash(uuid),
            prngSeed: _prngSeed(uuid),
            recipient: recipient,
            expiry: uint64(block.timestamp + 1 hours)
        });
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(localSignerPk, BondAttestationHelper.digest(nftAddr, attestation));
        vm.prank(recipient);
        nft.bond(tokenId, BOND_NAME, attestation, abi.encodePacked(r, s, v));

        assertEq(nft.ownerOf(tokenId), recipient, "token not transferred to recipient");
        assertEq(uint8(nft.getStage(tokenId)), uint8(IBuddyNFT.OwnershipStage.Bonded), "stage not Bonded");

        string memory json = SvgDecode.decodeJson(nft.tokenURI(tokenId));
        assertEq(json.readString(".attributes[5].value"), "Bonded", "post-bond Stage must be Bonded");
        assertEq(
            json.readString(".name"),
            string.concat(BOND_NAME, unicode" · Buddy Onchain #", Strings.toString(tokenId)),
            "post-bond name must be the bonded display name"
        );

        string memory svg = SvgDecode.decodeSvg(json.readString(".image"));
        assertTrue(SvgDecode.contains(svg, unicode" │ BONDED</text>"), "title rail must flip to BONDED");
        assertTrue(SvgDecode.contains(svg, ", Bonded</title>"), "svg <title> must flip to Bonded");

        emit log_named_uint("rehearsed bond on fork, tokenId", tokenId);
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
