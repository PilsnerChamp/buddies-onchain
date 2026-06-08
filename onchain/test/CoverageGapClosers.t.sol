// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, stdJson} from "forge-std/Test.sol";

import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";

import {BuddyFont} from "../contracts/BuddyFont.sol";
import {BuddyNFT} from "../contracts/BuddyNFT.sol";
import {BuddyRenderer} from "../contracts/BuddyRenderer.sol";
import {BuddySpriteData} from "../contracts/BuddySpriteData.sol";
import {BuddySpriteFont} from "../contracts/BuddySpriteFont.sol";
import {IBuddyNFT} from "../contracts/interfaces/IBuddyNFT.sol";
import {BondAttestationHelper} from "./helpers/BondAttestationHelper.sol";
import {MockBuddyNFTForRenderer} from "./helpers/MockBuddyNFTForRenderer.sol";
import {HatchHelper} from "./helpers/HatchHelper.sol";

contract BuddyRendererCoverageHarness is BuddyRenderer {
    constructor(address spriteData_, address font_, address spriteFont_)
        BuddyRenderer(spriteData_, font_, spriteFont_)
    {}

    function exposedXmlEscape(string memory value) external pure returns (string memory) {
        return _xmlEscape(value);
    }
}

contract CoverageGapClosersTest is Test, HatchHelper {
    using stdJson for string;

    string private constant TEST_UUID = "123e4567-e89b-42d3-a456-426614174000";
    string private constant JSON_PREFIX = "data:application/json;base64,";
    string private constant SVG_PREFIX = "data:image/svg+xml;base64,";
    string private constant FONT_PATH = "contract-data/fonts/chrome/BuddyFont.woff2";
    string private constant SPRITE_FONT_PATH = "contract-data/fonts/sprite/BuddySpriteFont.woff2";

    BuddySpriteData internal spriteData;
    BuddyFont internal buddyFont;
    BuddySpriteFont internal buddySpriteFont;
    BuddyRenderer internal renderer;
    BuddyRendererCoverageHarness internal rendererHarness;
    BuddyNFT internal nft;
    MockBuddyNFTForRenderer internal mockBuddy;

    address internal owner;
    address internal recipient;
    address internal signer;
    uint256 internal signerPk;

    function setUp() public {
        owner = makeAddr("owner");
        recipient = makeAddr("recipient");
        (signer, signerPk) = makeAddrAndKey("signer");

        spriteData = new BuddySpriteData();
        buddyFont = new BuddyFont(vm.readFileBinary(FONT_PATH));
        buddySpriteFont = new BuddySpriteFont(vm.readFileBinary(SPRITE_FONT_PATH));
        renderer = new BuddyRenderer(address(spriteData), address(buddyFont), address(buddySpriteFont));
        rendererHarness =
            new BuddyRendererCoverageHarness(address(spriteData), address(buddyFont), address(buddySpriteFont));
        nft = new BuddyNFT(owner, address(renderer));
        mockBuddy = new MockBuddyNFTForRenderer();

        vm.startPrank(owner);
        nft.setAttestationSigner(signer);
        nft.enableBonding();
        vm.stopPrank();
    }

    function test_getTokenIdByIdentity_afterHatch() public {
        uint256 tokenId = _hatchUuid(nft, TEST_UUID);
        bytes32 identityHash = _identityHash(TEST_UUID);

        assertEq(nft.getTokenIdByIdentity(identityHash), tokenId);
    }

    function test_constructor_zeroSpriteData_reverts() public {
        vm.expectRevert(BuddyRenderer.ZeroAddress.selector);
        new BuddyRenderer(address(0), address(buddyFont), address(buddySpriteFont));
    }

    function test_constructor_zeroFont_reverts() public {
        vm.expectRevert(BuddyRenderer.ZeroAddress.selector);
        new BuddyRenderer(address(spriteData), address(0), address(buddySpriteFont));
    }

    function test_constructor_zeroSpriteFont_reverts() public {
        vm.expectRevert(BuddyRenderer.ZeroAddress.selector);
        new BuddyRenderer(address(spriteData), address(buddyFont), address(0));
    }

    function test_labelFallback_speciesUnknown_reachesFallbackBeforeSpriteRevert() public {
        IBuddyNFT.BuddyTraits memory traits = _defaultTraits();
        traits.species = 18;
        _setMockToken(1, traits, "", uint32(0xF001), IBuddyNFT.OwnershipStage.Custodial);

        vm.expectRevert(BuddySpriteData.InvalidBodyIndex.selector);
        renderer.tokenURI(address(mockBuddy), 1);
    }

    function test_labelFallback_rarityUnknown() public {
        IBuddyNFT.BuddyTraits memory traits = _defaultTraits();
        traits.rarity = 5;
        string memory json = _renderMockJson(traits, IBuddyNFT.OwnershipStage.Custodial);

        assertTrue(_contains(json, '"trait_type":"Rarity","value":"Unknown"'));
    }

    function test_labelFallback_eyeGlyphQuestionMark() public {
        IBuddyNFT.BuddyTraits memory traits = _defaultTraits();
        traits.eyes = 6;
        string memory svg = _renderMockSvg(traits, IBuddyNFT.OwnershipStage.Custodial);

        assertTrue(_contains(svg, "?"));
    }

    function test_labelFallback_eyeLabelUnknown() public {
        IBuddyNFT.BuddyTraits memory traits = _defaultTraits();
        traits.eyes = 6;
        string memory json = _renderMockJson(traits, IBuddyNFT.OwnershipStage.Custodial);

        assertTrue(_contains(json, '"trait_type":"Eyes","value":"Unknown"'));
    }

    function test_xmlEscape_ampersand() public view {
        assertEq(rendererHarness.exposedXmlEscape("&"), "&amp;");
    }

    function test_xmlEscape_lessThan() public view {
        assertEq(rendererHarness.exposedXmlEscape("<"), "&lt;");
    }

    function test_xmlEscape_greaterThan() public view {
        assertEq(rendererHarness.exposedXmlEscape(">"), "&gt;");
    }

    function test_xmlEscape_quote() public view {
        assertEq(rendererHarness.exposedXmlEscape('"'), "&quot;");
    }

    function test_xmlEscape_apostrophe() public view {
        assertEq(rendererHarness.exposedXmlEscape("'"), "&apos;");
    }

    function test_jsonEscape_backslash() public {
        assertTrue(_bondedJsonNameContains("\\", "\\\\"));
    }

    function test_jsonEscape_backspace() public {
        assertTrue(_bondedJsonNameContains(string(abi.encodePacked(bytes1(0x08))), "\\b"));
    }

    function test_jsonEscape_tab() public {
        assertTrue(_bondedJsonNameContains("\t", "\\t"));
    }

    function test_jsonEscape_newline() public {
        assertTrue(_bondedJsonNameContains("\n", "\\n"));
    }

    function test_jsonEscape_formFeed() public {
        assertTrue(_bondedJsonNameContains(string(abi.encodePacked(bytes1(0x0c))), "\\f"));
    }

    function test_jsonEscape_carriageReturn() public {
        assertTrue(_bondedJsonNameContains("\r", "\\r"));
    }

    function test_jsonEscape_generalControl() public {
        assertTrue(_bondedJsonNameContains(string(abi.encodePacked(bytes1(0x01))), "\\u0001"));
    }

    function _bondedJsonNameContains(string memory name, string memory escapedName) internal returns (bool) {
        string memory json = _decodeJson(_hatchAndBond(name));
        return _contains(json, string.concat('"name":"', escapedName, unicode" · Buddy Onchain #1"));
    }

    function _hatchAndBond(string memory name) internal returns (string memory tokenUri) {
        uint256 tokenId = _hatchUuid(nft, TEST_UUID);
        BuddyNFT.BondAttestation memory attestation = BuddyNFT.BondAttestation({
            tokenId: tokenId,
            identityHash: _identityHash(TEST_UUID),
            recipient: recipient,
            expiry: uint64(block.timestamp + 1 hours)
        });
        bytes memory signature = _signBondAttestation(attestation);

        vm.prank(recipient);
        nft.bond(tokenId, name, attestation, signature);

        tokenUri = nft.tokenURI(tokenId);
    }

    function _signBondAttestation(BuddyNFT.BondAttestation memory attestation) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, BondAttestationHelper.digest(address(nft), attestation));
        return abi.encodePacked(r, s, v);
    }

    function _renderMockJson(IBuddyNFT.BuddyTraits memory traits, IBuddyNFT.OwnershipStage stage)
        internal
        returns (string memory)
    {
        return _decodeJson(_renderMockTokenUri(traits, stage));
    }

    function _renderMockSvg(IBuddyNFT.BuddyTraits memory traits, IBuddyNFT.OwnershipStage stage)
        internal
        returns (string memory)
    {
        return _decodeSvg(_decodeJson(_renderMockTokenUri(traits, stage)).readString(".image"));
    }

    function _renderMockTokenUri(IBuddyNFT.BuddyTraits memory traits, IBuddyNFT.OwnershipStage stage)
        internal
        returns (string memory)
    {
        _setMockToken(1, traits, "", uint32(0xB0B), stage);
        return renderer.tokenURI(address(mockBuddy), 1);
    }

    function _setMockToken(
        uint256 tokenId,
        IBuddyNFT.BuddyTraits memory traits,
        string memory name,
        uint32 prngSeed,
        IBuddyNFT.OwnershipStage stage
    ) internal {
        mockBuddy.setTraits(tokenId, traits);
        mockBuddy.setName(tokenId, name);
        mockBuddy.setIdentityHash(tokenId, keccak256(abi.encodePacked("coverage-gap-identity", tokenId)));
        mockBuddy.setPrngSeed(tokenId, prngSeed);
        mockBuddy.setStage(tokenId, stage);
    }

    function _defaultTraits() internal pure returns (IBuddyNFT.BuddyTraits memory traits) {
        traits.species = 0;
        traits.rarity = 0;
        traits.eyes = 0;
        traits.hat = 0;
        traits.shiny = false;
        traits.debugging = 1;
        traits.patience = 2;
        traits.chaos = 3;
        traits.wisdom = 4;
        traits.snark = 5;
    }

    function _decodeJson(string memory tokenUri) internal pure returns (string memory) {
        return string(Base64.decode(_afterPrefix(tokenUri, JSON_PREFIX)));
    }

    function _decodeSvg(string memory imageUri) internal pure returns (string memory) {
        return string(Base64.decode(_afterPrefix(imageUri, SVG_PREFIX)));
    }

    function _afterPrefix(string memory value, string memory prefix) internal pure returns (string memory) {
        bytes memory valueBytes = bytes(value);
        bytes memory prefixBytes = bytes(prefix);
        require(valueBytes.length >= prefixBytes.length, "prefix length");

        for (uint256 i; i < prefixBytes.length; ++i) {
            require(valueBytes[i] == prefixBytes[i], "prefix mismatch");
        }

        bytes memory out = new bytes(valueBytes.length - prefixBytes.length);
        for (uint256 i; i < out.length; ++i) {
            out[i] = valueBytes[prefixBytes.length + i];
        }
        return string(out);
    }

    function _contains(string memory haystack, string memory needle) internal pure returns (bool) {
        bytes memory haystackBytes = bytes(haystack);
        bytes memory needleBytes = bytes(needle);
        if (needleBytes.length == 0) return true;
        if (needleBytes.length > haystackBytes.length) return false;

        for (uint256 i; i <= haystackBytes.length - needleBytes.length; ++i) {
            bool matched = true;
            for (uint256 j; j < needleBytes.length; ++j) {
                if (haystackBytes[i + j] != needleBytes[j]) {
                    matched = false;
                    break;
                }
            }
            if (matched) return true;
        }

        return false;
    }
}
