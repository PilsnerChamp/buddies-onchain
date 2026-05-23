// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

import {BuddyFont} from "../contracts/BuddyFont.sol";
import {BuddyNFT} from "../contracts/BuddyNFT.sol";
import {BuddyRenderer} from "../contracts/BuddyRenderer.sol";
import {BuddySpriteData} from "../contracts/BuddySpriteData.sol";
import {BuddySpriteFont} from "../contracts/BuddySpriteFont.sol";
import {IBuddyNFT} from "../contracts/interfaces/IBuddyNFT.sol";
import {Mulberry32} from "../contracts/libraries/Mulberry32.sol";
import {MockBuddyNFTForRenderer} from "./helpers/MockBuddyNFTForRenderer.sol";

/// @dev Operator playbook on failure: each test asserts an empirical ceiling +~20% above the
///      observed baseline. If a test fails: (1) if the change is intentional, bump the constant
///      + update the baseline comment + commit; (2) otherwise investigate the drift. The 20%
///      headroom absorbs typical Solc/optimizer drift; a 25%+ regression signals a real change.
contract GasCeilingsTest is Test {
    bytes32 private constant BOND_ATTESTATION_TYPEHASH =
        keccak256("BondAttestation(uint256 tokenId,bytes32 identityHash,address recipient,uint64 expiry)");

    // Baseline: 229_357 gas; ~20% headroom rounded up for hatch storage/write-path drift.
    uint256 private constant HATCH_GAS_CEILING = 280_000;
    // Baseline: 84_823 gas; ~20% headroom rounded up for EIP-712 verification drift.
    uint256 private constant BOND_GAS_CEILING = 102_000;
    // Baseline: 5_309_133 gas; ~20% headroom rounded up for custodial SVG/base64 rendering drift.
    uint256 private constant TOKEN_URI_CUSTODIAL_GAS_CEILING = 6_400_000;
    // Baseline: 5_312_924 gas; ~20% headroom rounded up for bonded name/SVG/base64 rendering drift.
    uint256 private constant TOKEN_URI_BONDED_GAS_CEILING = 6_400_000;
    // Baseline: 6_592 gas; ~20% headroom rounded up for pure trait derivation drift.
    uint256 private constant MULBERRY32_DERIVE_TRAITS_GAS_CEILING = 8_000;
    // Baseline: 5_208_104 gas; ~20% headroom rounded up for pure renderer-path drift.
    uint256 private constant BUDDY_RENDERER_TOKEN_URI_GAS_CEILING = 6_300_000;
    // Baseline: 13_775 gas; ~20% headroom rounded up for admin renderer-rotation drift.
    uint256 private constant SET_RENDERER_GAS_CEILING = 17_000;

    string private constant TEST_UUID = "123e4567-e89b-42d3-a456-426614174000";
    string private constant BOND_NAME = "buddy";
    string private constant FONT_PATH = "contract-data/fonts/chrome/BuddyFont.woff2";
    string private constant SPRITE_FONT_PATH = "contract-data/fonts/sprite/BuddySpriteFont.woff2";
    uint32 private constant DERIVE_TRAITS_SEED = 1_530_910_344;

    BuddySpriteData internal spriteData;
    BuddyFont internal buddyFont;
    BuddySpriteFont internal buddySpriteFont;
    BuddyRenderer internal renderer;
    BuddyNFT internal nft;
    MockBuddyNFTForRenderer internal mockBuddy;

    uint256 internal signerPk;
    address internal signer;
    address internal recipient;

    function setUp() public {
        (signer, signerPk) = makeAddrAndKey("signer");
        recipient = makeAddr("recipient");

        spriteData = new BuddySpriteData();
        buddyFont = new BuddyFont(vm.readFileBinary(FONT_PATH));
        buddySpriteFont = new BuddySpriteFont(vm.readFileBinary(SPRITE_FONT_PATH));
        renderer = new BuddyRenderer(address(spriteData), address(buddyFont), address(buddySpriteFont));
        nft = new BuddyNFT(address(this), address(renderer));
        mockBuddy = new MockBuddyNFTForRenderer();

        nft.setAttestationSigner(signer);
        nft.enableBonding();
    }

    function test_gasCeiling_hatch() public {
        uint256 gasBefore = gasleft();
        uint256 tokenId = nft.hatch(TEST_UUID);
        uint256 gasUsed = gasBefore - gasleft();

        assertEq(tokenId, 1, "unexpected hatch tokenId");
        assertLe(gasUsed, HATCH_GAS_CEILING, "hatch gas exceeds ceiling");
    }

    function test_gasCeiling_bond() public {
        uint256 tokenId = nft.hatch(TEST_UUID);
        BuddyNFT.BondAttestation memory attestation = _bondAttestation(tokenId, TEST_UUID, recipient);
        bytes memory signature = _signBondAttestation(attestation);

        vm.prank(recipient);
        uint256 gasBefore = gasleft();
        nft.bond(tokenId, BOND_NAME, attestation, signature);
        uint256 gasUsed = gasBefore - gasleft();

        assertEq(nft.ownerOf(tokenId), recipient, "bond recipient did not receive token");
        assertLe(gasUsed, BOND_GAS_CEILING, "bond gas exceeds ceiling");
    }

    function test_gasCeiling_tokenURI_custodial() public {
        uint256 tokenId = nft.hatch(TEST_UUID);

        uint256 gasBefore = gasleft();
        string memory tokenUri = nft.tokenURI(tokenId);
        uint256 gasUsed = gasBefore - gasleft();

        assertGt(bytes(tokenUri).length, 0, "empty tokenURI");
        assertLe(gasUsed, TOKEN_URI_CUSTODIAL_GAS_CEILING, "custodial tokenURI gas exceeds ceiling");
    }

    function test_gasCeiling_tokenURI_bonded() public {
        uint256 tokenId = _hatchAndBond();

        uint256 gasBefore = gasleft();
        string memory tokenUri = nft.tokenURI(tokenId);
        uint256 gasUsed = gasBefore - gasleft();

        assertGt(bytes(tokenUri).length, 0, "empty tokenURI");
        assertLe(gasUsed, TOKEN_URI_BONDED_GAS_CEILING, "bonded tokenURI gas exceeds ceiling");
    }

    // WyHash.hash keeps its source-of-truth gas ceiling in WyHash.t.sol::test_hash_gasUnder8K.

    function test_gasCeiling_Mulberry32_deriveTraits() public view {
        uint256 gasBefore = gasleft();
        (
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
        ) = Mulberry32.deriveTraits(DERIVE_TRAITS_SEED);
        uint256 gasUsed = gasBefore - gasleft();

        assertEq(species, 7, "species mismatch");
        assertEq(rarity, 0, "rarity mismatch");
        assertEq(eyes, 4, "eyes mismatch");
        assertEq(hat, 0, "hat mismatch");
        assertFalse(shiny, "shiny mismatch");
        assertEq(debugging, 6, "debugging mismatch");
        assertEq(patience, 83, "patience mismatch");
        assertEq(chaos, 35, "chaos mismatch");
        assertEq(wisdom, 1, "wisdom mismatch");
        assertEq(snark, 31, "snark mismatch");
        assertLe(gasUsed, MULBERRY32_DERIVE_TRAITS_GAS_CEILING, "Mulberry32 deriveTraits gas exceeds ceiling");
    }

    function test_gasCeiling_BuddyRenderer_tokenURI() public {
        _setMockToken(1, _defaultTraits(), BOND_NAME, bytes32(uint256(0xD16A)), IBuddyNFT.OwnershipStage.Bonded);

        uint256 gasBefore = gasleft();
        string memory tokenUri = renderer.tokenURI(address(mockBuddy), 1);
        uint256 gasUsed = gasBefore - gasleft();

        assertGt(bytes(tokenUri).length, 0, "empty renderer tokenURI");
        assertLe(gasUsed, BUDDY_RENDERER_TOKEN_URI_GAS_CEILING, "BuddyRenderer tokenURI gas exceeds ceiling");
    }

    function test_gasCeiling_setRenderer() public {
        address newRenderer = makeAddr("newRenderer");

        uint256 gasBefore = gasleft();
        nft.setRenderer(newRenderer);
        uint256 gasUsed = gasBefore - gasleft();

        assertEq(nft.renderer(), newRenderer, "renderer not updated");
        assertLe(gasUsed, SET_RENDERER_GAS_CEILING, "setRenderer gas exceeds ceiling");
    }

    function _hatchAndBond() internal returns (uint256 tokenId) {
        tokenId = nft.hatch(TEST_UUID);
        BuddyNFT.BondAttestation memory attestation = _bondAttestation(tokenId, TEST_UUID, recipient);
        bytes memory signature = _signBondAttestation(attestation);

        vm.prank(recipient);
        nft.bond(tokenId, BOND_NAME, attestation, signature);
    }

    function _bondAttestation(uint256 tokenId, string memory uuid, address recipient_)
        internal
        view
        returns (BuddyNFT.BondAttestation memory)
    {
        return BuddyNFT.BondAttestation({
            tokenId: tokenId,
            identityHash: keccak256(bytes(uuid)),
            recipient: recipient_,
            expiry: uint64(block.timestamp + 1 hours)
        });
    }

    function _domainSeparator() internal view returns (bytes32) {
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

    function _signBondAttestation(BuddyNFT.BondAttestation memory attestation) internal view returns (bytes memory) {
        bytes32 digest = MessageHashUtils.toTypedDataHash(_domainSeparator(), _hashAttestation(attestation));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _defaultTraits() internal pure returns (IBuddyNFT.BuddyTraits memory traits) {
        traits.species = 0;
        traits.rarity = 1;
        traits.eyes = 0;
        traits.hat = 5;
        traits.shiny = false;
        traits.debugging = 82;
        traits.patience = 68;
        traits.chaos = 41;
        traits.wisdom = 93;
        traits.snark = 57;
    }

    function _setMockToken(
        uint256 tokenId,
        IBuddyNFT.BuddyTraits memory traits,
        string memory name,
        bytes32 identityHash,
        IBuddyNFT.OwnershipStage stage
    ) internal {
        mockBuddy.setTraits(tokenId, traits);
        mockBuddy.setName(tokenId, name);
        mockBuddy.setIdentityHash(tokenId, identityHash);
        mockBuddy.setPrngSeed(tokenId, uint32(uint256(identityHash)));
        mockBuddy.setStage(tokenId, stage);
    }
}
