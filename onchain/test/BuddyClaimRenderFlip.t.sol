// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, stdJson} from "forge-std/Test.sol";

import {BuddyNFT} from "../contracts/BuddyNFT.sol";
import {BuddyRenderer} from "../contracts/BuddyRenderer.sol";
import {IBuddyNFT} from "../contracts/interfaces/IBuddyNFT.sol";
import {Deploy} from "../script/Deploy.s.sol";
import {ClaimAttestationHelper} from "./helpers/ClaimAttestationHelper.sol";
import {SvgDecode} from "./helpers/SvgDecode.sol";
import {HatchHelper} from "./helpers/HatchHelper.sol";

/// @title BuddyClaimRenderFlip
/// @notice Integration seam over the REAL BuddyNFT<->BuddyRenderer wiring: proves
///         the tokenURI flips Hatched->Bonded (name, Stage attribute, SVG title rail,
///         SVG <title>) across a live claim, and that a setRenderer pointer swap
///         re-renders byte-identically from a freshly redeployed renderer.
/// @dev    Existing suites cover claim mechanics (BuddyNFTClaim) and stage-driven
///         render (BuddyRenderer, via a mock) separately. This is the only test
///         that drives the flip end-to-end through `Deploy.deployAll`. Decode/search
///         helpers come from the shared SvgDecode lib (single source of truth across
///         the §1 hermetic and §2 fork suites).
contract BuddyClaimRenderFlip is Test, HatchHelper {
    using stdJson for string;

    string internal constant TEST_UUID = "123e4567-e89b-42d3-a456-426614174000";
    string internal constant CLAIM_NAME = "Pilsner";

    Deploy.Deployment internal d;
    BuddyNFT internal nft;

    uint256 internal signerPk = uint256(keccak256("claim-render-flip-signer"));
    address internal recipient = makeAddr("claim-render-flip-recipient");

    function setUp() public {
        Deploy deploy = new Deploy();
        d = deploy.deployAll(address(this)); // owner == this test contract
        nft = d.nft;

        nft.setAttestationSigner(vm.addr(signerPk));
        nft.enableBonding();
    }

    function test_hatch_rendersHatchedState() public {
        uint256 tokenId = _hatchUuid(nft, TEST_UUID);
        assertEq(tokenId, 1, "first hatch tokenId mismatch");
        assertEq(uint8(nft.getStage(tokenId)), uint8(IBuddyNFT.OwnershipStage.Custodial), "stage not Custodial");

        string memory json = SvgDecode.decodeJson(nft.tokenURI(tokenId));
        assertEq(json.readString(".name"), "Buddy Onchain #1", "pre-claim (Hatched) name must be the bare token label");
        assertEq(json.readString(".attributes[5].value"), "Hatched", "pre-claim Stage attribute must be Hatched");

        string memory svg = SvgDecode.decodeSvg(json.readString(".image"));
        assertTrue(SvgDecode.contains(svg, unicode" │ HATCHED</text>"), "title rail must end HATCHED");
        assertTrue(SvgDecode.contains(svg, ", Hatched</title>"), "svg <title> must end Hatched");
    }

    function test_claim_flipsRenderToBondedState() public {
        uint256 tokenId = _hatchUuid(nft, TEST_UUID);

        // Snapshot the pre-claim (Hatched) stage so the flip is a true before/after, not a bare read.
        string memory preClaimJson = SvgDecode.decodeJson(nft.tokenURI(tokenId));
        assertEq(preClaimJson.readString(".attributes[5].value"), "Hatched", "precondition: must start Hatched");

        _claim();

        assertEq(nft.ownerOf(tokenId), recipient, "token not transferred to recipient");
        assertEq(uint8(nft.getStage(tokenId)), uint8(IBuddyNFT.OwnershipStage.Bonded), "stage not Bonded");

        string memory json = SvgDecode.decodeJson(nft.tokenURI(tokenId));
        assertEq(
            json.readString(".name"),
            string.concat(CLAIM_NAME, unicode" · Buddy Onchain #1"),
            "post-claim (Bonded) name must be the bonded display name"
        );
        assertEq(json.readString(".attributes[5].value"), "Bonded", "post-claim Stage attribute must be Bonded");

        string memory svg = SvgDecode.decodeSvg(json.readString(".image"));
        assertTrue(SvgDecode.contains(svg, unicode" │ BONDED</text>"), "title rail must flip to BONDED");
        assertTrue(SvgDecode.contains(svg, ", Bonded</title>"), "svg <title> must flip to Bonded");
        assertFalse(SvgDecode.contains(svg, unicode" │ HATCHED</text>"), "HATCHED rail must be gone after claim");
    }

    function test_setRenderer_swapReRendersByteIdentical() public {
        uint256 tokenId = _hatchUuid(nft, TEST_UUID);
        _claim();

        string memory before = nft.tokenURI(tokenId);

        // Fresh renderer over the SAME sprite/font data contracts: output is a pure
        // function of token state + shared data, so the swap must be byte-identical.
        BuddyRenderer swapped =
            new BuddyRenderer(address(d.spriteData), address(d.buddyFont), address(d.buddySpriteFont));
        nft.setRenderer(address(swapped));
        assertEq(nft.renderer(), address(swapped), "renderer pointer did not move");

        assertEq(nft.tokenURI(tokenId), before, "swap to identical renderer must preserve tokenURI byte-for-byte");
    }

    function test_setRenderer_zeroReverts() public {
        vm.expectRevert(BuddyNFT.ZeroAddress.selector);
        nft.setRenderer(address(0));
    }

    function _claim() internal {
        BuddyNFT.ClaimAttestation memory attestation = BuddyNFT.ClaimAttestation({
            identityHash: _identityHash(TEST_UUID),
            prngSeed: _prngSeed(TEST_UUID),
            provider: CLAUDE_PROVIDER,
            name: CLAIM_NAME,
            recipient: recipient,
            expiry: uint64(block.timestamp + 1 hours)
        });
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, ClaimAttestationHelper.digest(address(nft), attestation));
        vm.prank(recipient);
        nft.claim(attestation, abi.encodePacked(r, s, v));
    }
}
