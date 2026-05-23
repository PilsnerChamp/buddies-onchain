// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

import {BuddyNFT} from "../contracts/BuddyNFT.sol";
import {IBuddyNFT} from "../contracts/interfaces/IBuddyNFT.sol";
import {Deploy} from "../script/Deploy.s.sol";

contract DeploySmokeTest is Test {
    bytes32 private constant BOND_ATTESTATION_TYPEHASH =
        keccak256("BondAttestation(uint256 tokenId,bytes32 identityHash,address recipient,uint64 expiry)");

    string internal constant TEST_UUID = "123e4567-e89b-42d3-a456-426614174000";
    string internal constant BOND_NAME = "buddy";
    string internal constant JSON_PREFIX = "data:application/json;base64,";

    function test_deployScript_fullLifecycle() public {
        Deploy deploy = new Deploy();
        Deploy.Deployment memory d = deploy.deployAll(address(this));

        assertNotEq(address(d.nft), address(0), "BuddyNFT not deployed");
        assertNotEq(address(d.renderer), address(0), "BuddyRenderer not deployed");
        assertNotEq(address(d.spriteData), address(0), "BuddySpriteData not deployed");
        assertNotEq(address(d.buddyFont), address(0), "BuddyFont not deployed");
        assertNotEq(address(d.buddySpriteFont), address(0), "BuddySpriteFont not deployed");

        assertEq(d.nft.renderer(), address(d.renderer), "BuddyNFT renderer not wired");
        assertEq(d.nft.owner(), address(this), "BuddyNFT owner mismatch");

        uint256 signerPk = uint256(keccak256("deploy-smoke-signer"));
        address signer = vm.addr(signerPk);
        d.nft.setAttestationSigner(signer);
        d.nft.enableBonding();
        assertEq(d.nft.attestationSigner(), signer, "attestation signer not set");
        assertTrue(d.nft.bondingEnabled(), "bonding not enabled");

        uint256 tokenId = d.nft.hatch(TEST_UUID);
        assertEq(tokenId, 1, "first hatch tokenId mismatch");

        address recipient = makeAddr("deploy-smoke-recipient");
        BuddyNFT.BondAttestation memory attestation = BuddyNFT.BondAttestation({
            tokenId: tokenId,
            identityHash: keccak256(bytes(TEST_UUID)),
            recipient: recipient,
            expiry: uint64(block.timestamp + 1 hours)
        });
        bytes memory signature = _signBondAttestation(d.nft, attestation, signerPk);

        vm.prank(recipient);
        d.nft.bond(tokenId, BOND_NAME, attestation, signature);
        assertEq(d.nft.ownerOf(tokenId), recipient, "bond recipient did not receive token");

        string memory tokenUri = d.nft.tokenURI(tokenId);
        assertTrue(_startsWith(tokenUri, JSON_PREFIX), "tokenURI missing JSON data URI prefix");
        assertGt(bytes(tokenUri).length, bytes(JSON_PREFIX).length, "tokenURI has empty JSON payload");

        IBuddyNFT.BuddyTraits memory traits = d.nft.buddyTraits(tokenId);
        assertTrue(_hasNonDefaultTraits(traits), "buddy traits are all default values");
    }

    function _domainSeparator(BuddyNFT nft) internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("BuddyNFT"),
                keccak256("1"),
                block.chainid,
                address(nft)
            )
        );
    }

    function _hashAttestation(BuddyNFT.BondAttestation memory attestation) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                BOND_ATTESTATION_TYPEHASH,
                attestation.tokenId,
                attestation.identityHash,
                attestation.recipient,
                attestation.expiry
            )
        );
    }

    function _signBondAttestation(BuddyNFT nft, BuddyNFT.BondAttestation memory attestation, uint256 signerPk)
        internal
        view
        returns (bytes memory)
    {
        bytes32 digest = MessageHashUtils.toTypedDataHash(_domainSeparator(nft), _hashAttestation(attestation));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _hasNonDefaultTraits(IBuddyNFT.BuddyTraits memory traits) internal pure returns (bool) {
        return traits.species != 0 || traits.rarity != 0 || traits.eyes != 0 || traits.hat != 0 || traits.shiny
            || traits.debugging != 0 || traits.patience != 0 || traits.chaos != 0 || traits.wisdom != 0
            || traits.snark != 0;
    }

    function _startsWith(string memory value, string memory prefix) internal pure returns (bool) {
        bytes memory valueBytes = bytes(value);
        bytes memory prefixBytes = bytes(prefix);

        if (prefixBytes.length > valueBytes.length) {
            return false;
        }

        for (uint256 i; i < prefixBytes.length; ++i) {
            if (valueBytes[i] != prefixBytes[i]) {
                return false;
            }
        }

        return true;
    }
}
