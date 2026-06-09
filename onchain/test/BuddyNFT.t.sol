// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {BuddyNFT} from "../contracts/BuddyNFT.sol";

contract BuddyNFTTest is Test {
    event RendererUpdated(address indexed renderer);
    event BatchMetadataUpdate(uint256 _fromTokenId, uint256 _toTokenId);
    event AttestationSignerUpdated(address indexed signer);
    event BondingEnabled();

    BuddyNFT internal nft;
    address internal owner;
    address internal initialRenderer;
    address internal signer;

    function setUp() public {
        owner = makeAddr("owner");
        initialRenderer = makeAddr("initialRenderer");
        signer = makeAddr("signer");
        nft = new BuddyNFT(owner, initialRenderer);
    }

    function test_supportsERC721Interface() public view {
        assertTrue(nft.supportsInterface(0x01ffc9a7));
        assertTrue(nft.supportsInterface(0x80ac58cd));
    }

    function test_setsCollectionMetadata() public view {
        assertEq(nft.name(), "Buddies Onchain");
        assertEq(nft.symbol(), "BUDDY");
    }

    function test_setsInitialOwnerAndRenderer() public view {
        assertEq(nft.owner(), owner);
        assertEq(nft.renderer(), initialRenderer);
    }

    function test_setsAuthorAttestationSignerConstant() public view {
        assertEq(nft.AUTHOR_ATTESTATION_SIGNER(), 0x8e74D78a7AEa7542A23EdBE341bdc986ECcC6E0b);
    }

    function test_attestationSignerStartsZero() public view {
        assertEq(nft.attestationSigner(), address(0));
    }

    function test_bondingEnabledStartsFalse() public view {
        assertFalse(nft.bondingEnabled());
    }

    function test_setRendererSuccess() public {
        address newRenderer = makeAddr("newRenderer");

        vm.prank(owner);
        nft.setRenderer(newRenderer);

        assertEq(nft.renderer(), newRenderer);
    }

    function test_setRendererRevertsZero() public {
        vm.expectRevert(BuddyNFT.ZeroAddress.selector);
        vm.prank(owner);
        nft.setRenderer(address(0));
    }

    function test_setRendererRevertsNonOwner() public {
        address stranger = makeAddr("stranger");

        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        vm.prank(stranger);
        nft.setRenderer(makeAddr("newRenderer"));
    }

    function test_setRendererEmitsEvent() public {
        address newRenderer = makeAddr("newRenderer");

        vm.expectEmit(true, false, false, true, address(nft));
        emit RendererUpdated(newRenderer);

        vm.expectEmit(false, false, false, true, address(nft));
        emit BatchMetadataUpdate(0, type(uint256).max);

        vm.prank(owner);
        nft.setRenderer(newRenderer);
    }

    function test_setAttestationSignerSuccess() public {
        vm.prank(owner);
        nft.setAttestationSigner(signer);

        assertEq(nft.attestationSigner(), signer);
    }

    function test_setAttestationSignerAcceptsZeroWhenBondingDisabled() public {
        vm.startPrank(owner);
        nft.setAttestationSigner(signer);
        nft.setAttestationSigner(address(0));
        vm.stopPrank();

        assertEq(nft.attestationSigner(), address(0));
    }

    function test_setAttestationSignerRevertsZeroWhenBondingEnabled() public {
        _setSignerAndEnableBonding();

        vm.expectRevert(BuddyNFT.ZeroAddress.selector);
        vm.prank(owner);
        nft.setAttestationSigner(address(0));
    }

    function test_setAttestationSignerRevertsNonOwner() public {
        address stranger = makeAddr("stranger");

        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        vm.prank(stranger);
        nft.setAttestationSigner(signer);
    }

    function test_setAttestationSignerEmitsEvent() public {
        vm.expectEmit(true, false, false, true, address(nft));
        emit AttestationSignerUpdated(signer);

        vm.prank(owner);
        nft.setAttestationSigner(signer);
    }

    function test_enableBondingSuccess() public {
        vm.startPrank(owner);
        nft.setAttestationSigner(signer);
        nft.enableBonding();
        vm.stopPrank();

        assertTrue(nft.bondingEnabled());
    }

    function test_enableBondingRevertsWhenSignerZero() public {
        vm.expectRevert(BuddyNFT.ZeroAddress.selector);
        vm.prank(owner);
        nft.enableBonding();
    }

    function test_enableBondingRevertsWhenAlreadyEnabled() public {
        _setSignerAndEnableBonding();

        vm.expectRevert(BuddyNFT.BondingAlreadyEnabled.selector);
        vm.prank(owner);
        nft.enableBonding();
    }

    function test_enableBondingRevertsNonOwner() public {
        address stranger = makeAddr("stranger");

        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        vm.prank(stranger);
        nft.enableBonding();
    }

    function test_enableBondingEmitsEvent() public {
        vm.prank(owner);
        nft.setAttestationSigner(signer);

        vm.expectEmit(false, false, false, true, address(nft));
        emit BondingEnabled();

        vm.prank(owner);
        nft.enableBonding();
    }

    function test_enableBondingIsPermanent() public {
        address rotatedSigner = makeAddr("rotatedSigner");

        _setSignerAndEnableBonding();

        vm.prank(owner);
        nft.setAttestationSigner(rotatedSigner);

        assertTrue(nft.bondingEnabled());
        assertEq(nft.attestationSigner(), rotatedSigner);
    }

    function test_renounceOwnershipRevertsWhenBondingDisabled() public {
        vm.expectRevert(BuddyNFT.BondingNotEnabled.selector);
        vm.prank(owner);
        nft.renounceOwnership();
    }

    function test_renounceOwnershipSucceedsWhenBondingEnabled() public {
        _setSignerAndEnableBonding();

        vm.prank(owner);
        nft.renounceOwnership();

        assertEq(nft.owner(), address(0));
    }

    function test_renounceOwnershipRevertsNonOwner() public {
        address stranger = makeAddr("stranger");

        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        vm.prank(stranger);
        nft.renounceOwnership();
    }

    function _setSignerAndEnableBonding() internal {
        vm.startPrank(owner);
        nft.setAttestationSigner(signer);
        nft.enableBonding();
        vm.stopPrank();
    }
}
