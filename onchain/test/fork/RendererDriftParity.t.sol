// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Test} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";

import {BuddyNFT} from "../../contracts/BuddyNFT.sol";
import {BuddyRenderer} from "../../contracts/BuddyRenderer.sol";

/// @title RendererDriftParity
/// @notice Literal byte-match of the LIVE on-chain render against the CURRENT renderer
///         source, for the real token #1 on Base Sepolia. The tracker's "byte-match live
///         SVG vs local renderer fixture" item: the hermetic suite proves the renderer is
///         deterministic from the uuid hash, but it cannot prove the DEPLOYED bytecode
///         equals today's source. This forks the live deploy, reads tokenURI(1) from the
///         deployed renderer, gates live `setRenderer` access control with an
///         OwnableUnauthorizedAccount revert from a non-owner, then swaps in a renderer
///         freshly compiled from HEAD (pointed at the data contracts the live renderer
///         itself holds, read from its public immutables) and reads tokenURI(1) again.
///         Byte-equal ⇒ the deployed renderer matches HEAD source for token #1's
///         exercised render path (its traits + stage); full trait-space equivalence stays
///         the hermetic suite's job. No uuid needed: token #1's traits already live in
///         the deployed BuddyNFT.
/// @dev    Runnable with ONLY a fork URL — no private keys, no pasted address. Addresses
///         load from the `deployments/84532.json` manifest (repo source of truth). The
///         renderer swap is an owner prank on the fork and is discarded. Skips cleanly
///         (vm.skip) when the RPC env or manifest is absent, or when nothing has hatched
///         yet (totalSupply == 0), so `forge test` stays green pre-deploy and in CI.
///
///         Env:
///           SEPOLIA_RPC_URL  — Base Sepolia RPC (e.g. https://sepolia.base.org)
///
///         Run: forge test --match-contract RendererDriftParity -vv
contract RendererDriftParityTest is Test {
    using stdJson for string;

    uint256 internal constant BASE_SEPOLIA_CHAIN_ID = 84532;
    string internal constant MANIFEST_PATH = "deployments/84532.json";
    uint256 internal constant TOKEN_ID = 1; // first hatch; exists iff totalSupply >= 1

    function test_rendererDrift_liveAccessControlAndSvgMatchesHeadSource() public {
        string memory rpc = vm.envOr("SEPOLIA_RPC_URL", string(""));
        if (bytes(rpc).length == 0 || !vm.exists(MANIFEST_PATH)) {
            emit log("skip: set SEPOLIA_RPC_URL and deploy (deployments/84532.json) to byte-match the live render");
            vm.skip(true);
            return;
        }

        vm.createSelectFork(rpc);
        assertEq(block.chainid, BASE_SEPOLIA_CHAIN_ID, "fork is not Base Sepolia (84532)");

        string memory manifest = vm.readFile(MANIFEST_PATH);
        address nftAddr = manifest.readAddress(".addresses.BuddyNFT");
        require(nftAddr != address(0), "manifest missing .addresses.BuddyNFT");
        BuddyNFT nft = BuddyNFT(nftAddr);

        if (nft.totalSupply() == 0) {
            emit log("skip: nothing hatched on the live deploy yet (totalSupply == 0)");
            vm.skip(true);
            return;
        }

        // Live render: deployed BuddyRenderer bytecode, token #1's on-chain traits.
        string memory liveUri = nft.tokenURI(TOKEN_ID);

        // Fresh renderer compiled from HEAD source, pointed at the data contracts the LIVE
        // renderer actually holds — read from its own public immutables via nft.renderer(),
        // NOT from the manifest. Reading ground truth off-chain-of-record this way means the
        // font/sprite data is provably identical to the deployed render path, so the ONLY
        // variable left is the renderer bytecode itself: a mismatch is then unambiguously
        // renderer-source drift, never a data-contract divergence the manifest might
        // misreport.
        address liveRendererAddr = nft.renderer();
        BuddyRenderer liveRenderer = BuddyRenderer(liveRendererAddr);
        BuddyRenderer headRenderer =
            new BuddyRenderer(address(liveRenderer.spriteData()), liveRenderer.font(), liveRenderer.spriteFont());

        address nonOwner = address(0xB0B);
        require(nonOwner != nft.owner(), "test non-owner unexpectedly owns live BuddyNFT");

        vm.prank(nonOwner);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, nonOwner));
        nft.setRenderer(address(headRenderer));
        assertEq(nft.renderer(), liveRendererAddr, "non-owner changed renderer");

        vm.prank(nft.owner());
        nft.setRenderer(address(headRenderer));
        assertEq(nft.renderer(), address(headRenderer), "owner setRenderer did not persist HEAD renderer");

        string memory headUri = nft.tokenURI(TOKEN_ID);

        // Whole tokenURI byte-equality: base64(JSON) wrapping base64(SVG). Equal here means
        // metadata AND the embedded SVG are byte-identical between deployed and HEAD — for
        // token #1's traits + stage. Full trait-space parity stays the hermetic suite's job
        // (BuddyRenderer.t.sol, hatch-coverage, circle-drift); this is the live-vs-HEAD byte
        // check for the one real on-chain token.
        assertEq(headUri, liveUri, "deployed renderer output drifted from HEAD source for token #1");

        emit log_named_uint("byte-matched live tokenURI against HEAD renderer, tokenId", TOKEN_ID);
    }
}
