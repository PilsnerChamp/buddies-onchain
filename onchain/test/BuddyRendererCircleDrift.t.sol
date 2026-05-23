// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IBuddyNFT} from "../contracts/interfaces/IBuddyNFT.sol";
import {Test, stdJson} from "forge-std/Test.sol";

import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";

import {BuddyFont} from "../contracts/BuddyFont.sol";
import {BuddyRenderer} from "../contracts/BuddyRenderer.sol";
import {BuddySpriteData} from "../contracts/BuddySpriteData.sol";
import {BuddySpriteFont} from "../contracts/BuddySpriteFont.sol";
import {MockBuddyNFTForRenderer} from "./helpers/MockBuddyNFTForRenderer.sol";

/// @notice Contract coverage for the promoted background-circle drift animation
///         (accepted deviation #3). Math source of truth: `onchain/contract-data/sprites/sprite-geometry.md`.
contract BuddyRendererCircleDriftTest is Test {
    using stdJson for string;

    string internal constant JSON_PREFIX = "data:application/json;base64,";
    string internal constant SVG_PREFIX = "data:image/svg+xml;base64,";
    bytes internal constant DECIMAL_DIGITS = "0123456789";

    bytes1 internal constant ASCII_S = 0x73;

    BuddySpriteData internal spriteData;
    BuddyFont internal buddyFont;
    BuddySpriteFont internal buddySpriteFont;
    BuddyRenderer internal renderer;
    MockBuddyNFTForRenderer internal mockBuddy;

    uint256[11] internal slowPool = [
        uint256(29),
        31,
        37,
        41,
        43,
        47,
        53,
        59,
        61,
        67,
        71
    ];

    function setUp() public {
        spriteData = new BuddySpriteData();
        buddyFont = new BuddyFont(vm.readFileBinary("contract-data/fonts/chrome/BuddyFont.woff2"));
        buddySpriteFont = new BuddySpriteFont(vm.readFileBinary("contract-data/fonts/sprite/BuddySpriteFont.woff2"));
        renderer = new BuddyRenderer(address(spriteData), address(buddyFont), address(buddySpriteFont));
        mockBuddy = new MockBuddyNFTForRenderer();
    }

    // --- 1. Only slow-pool primes appear as drift periods ---------------------------

    function test_tokenURI_driftPeriodsComeFromSlowPoolOnly() public {
        // Spray 20 distinct identity hashes; every emitted (period) value must lie in slowPool.
        for (uint256 salt = 1; salt <= 20; ++salt) {
            string memory svg = _renderSvg(salt, keccak256(abi.encodePacked("slow-pool-spread", salt)));
            (uint256 p0, uint256 p1, uint256 p2,,,) = _parseAllDriftTriples(svg);

            assertTrue(_isInSlowPool(p0), "circle 0 period outside slow pool");
            assertTrue(_isInSlowPool(p1), "circle 1 period outside slow pool");
            assertTrue(_isInSlowPool(p2), "circle 2 period outside slow pool");
        }
    }

    // --- 2. Pairwise-distinct periods per token (sampling without replacement) ------

    function test_tokenURI_driftPeriodsAreDistinctPerToken() public {
        for (uint256 salt = 1; salt <= 20; ++salt) {
            string memory svg = _renderSvg(salt, keccak256(abi.encodePacked("distinct-triple", salt)));
            (uint256 p0, uint256 p1, uint256 p2,,,) = _parseAllDriftTriples(svg);

            assertTrue(p0 != p1, "circles 0 and 1 share a period");
            assertTrue(p1 != p2, "circles 1 and 2 share a period");
            assertTrue(p0 != p2, "circles 0 and 2 share a period");
        }
    }

    // --- 3. Drift triples vary across tokens ---------------------------------------

    function test_tokenURI_driftVariesAcrossTokens() public {
        string memory svgA = _renderSvg(1, keccak256("drift-cross-token-a"));
        string memory svgB = _renderSvg(2, keccak256("drift-cross-token-b"));

        (uint256 pa0, uint256 pa1, uint256 pa2, uint256 da0, uint256 da1, uint256 da2) = _parseAllDriftTriples(svgA);
        (uint256 pb0, uint256 pb1, uint256 pb2, uint256 db0, uint256 db1, uint256 db2) = _parseAllDriftTriples(svgB);

        bool differs = (pa0 != pb0)
            || (pa1 != pb1)
            || (pa2 != pb2)
            || (da0 != db0)
            || (da1 != db1)
            || (da2 != db2);
        assertTrue(differs, "two distinct identity hashes produced identical drift triples");
    }

    // --- 4. cx/cy remain as attributes on <circle> (degradation path) --------------

    function test_tokenURI_circleCxCyStayAsAttributes() public {
        string memory svg = _renderSvg(1, keccak256("degradation-cx-cy"));

        // Every circle carries cx= and cy= attributes, one per circle.
        assertEq(_countOccurrences(svg, "<circle"), 3);
        assertEq(_countOccurrences(svg, ' cx="'), 3, "each circle must keep its cx= attribute");
        assertEq(_countOccurrences(svg, ' cy="'), 3, "each circle must keep its cy= attribute");

        // The drift translate animates the <circle>'s transform — cx/cy must not have
        // migrated into the CSS rule set.
        assertFalse(
            _contains(svg, "translate(cx"),
            "cx must not appear inside a CSS translate(...) call"
        );
        assertFalse(
            _contains(svg, "translate(cy"),
            "cy must not appear inside a CSS translate(...) call"
        );
    }

    // --- 5. delay < period per the (mix >> 8) % period formula ----------------------

    function test_tokenURI_driftDelayLessThanPeriod() public {
        for (uint256 salt = 1; salt <= 10; ++salt) {
            string memory svg = _renderSvg(salt, keccak256(abi.encodePacked("delay-lt-period", salt)));
            (uint256 p0, uint256 p1, uint256 p2, uint256 d0, uint256 d1, uint256 d2) = _parseAllDriftTriples(svg);

            assertLt(d0, p0, "circle 0 delay >= period");
            assertLt(d1, p1, "circle 1 delay >= period");
            assertLt(d2, p2, "circle 2 delay >= period");
        }
    }

    // --- 6. Bytecode-layer slow-pool-only enforcement -------------------------------
    //
    // The DRIFT_PRIMES constant is the single source of prime truth. The runtime
    // bytecode must contain the slow-pool byte run (1D1F25292B2F353B3D4347) and must
    // NOT contain the fast-pool byte run (0305070B0D111317). We search for the exact
    // byte sequences — a non-contiguous accidental appearance of individual low prime
    // bytes elsewhere in the code (e.g. inside string literals carrying 0x07, 0x0b)
    // is ignored by design because the invariant is "no pool constant shaped like the
    // fast pool exists in bytecode."

    function test_runtimeBytecode_omitsFastPoolPrimes() public view {
        bytes memory code = address(renderer).code;
        // Slow pool (29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71) encoded as ascending bytes.
        bytes memory slowRun = hex"1D1F25292B2F353B3D4347";
        // Fast pool (3, 5, 7, 11, 13, 17, 19, 23) encoded as ascending bytes.
        bytes memory fastRun = hex"0305070B0D111317";

        assertTrue(_containsBytes(code, slowRun), "runtime bytecode is missing the slow-pool constant");
        assertFalse(
            _containsBytes(code, fastRun),
            "runtime bytecode contains the fast-pool constant 03 05 07 0B 0D 11 13 17"
        );
    }

    // --- 7. Motion grammar invariant — exactly two timing functions ----------------

    function test_tokenURI_motionGrammarInvariant_exactlyTwoTimingFunctions() public {
        string memory svg = _renderSvg(1, keccak256("motion-grammar"));

        // Sprite animations use step-start (4 frame groups → 4 occurrences).
        assertGt(_countOccurrences(svg, "step-start"), 0, "missing step-start (sprite grammar)");
        // Circle drift uses ease-in-out (3 circles → 3 occurrences).
        assertGt(_countOccurrences(svg, "ease-in-out"), 0, "missing ease-in-out (drift grammar)");

        // No other timing function may appear. Per the renderer's two-axis motion
        // doctrine (see `docs/onchain/renderer.md` § Animation and § Background
        // circle drift), exactly two timing grammars ship: `step-start` for sprite,
        // `ease-in-out` for drift. CSS timing functions appear in animation
        // shorthands as space-delimited tokens between
        // the duration and the `;` or `infinite` keyword. We search for the exact
        // delimited shapes a non-canonical timing function would take so that
        // `<linearGradient>` (SVG) and `ease-in-out` (legitimate drift grammar) are
        // not caught as false positives.
        assertEq(_countOccurrences(svg, " linear "), 0, "linear timing function is forbidden");
        assertEq(_countOccurrences(svg, " linear;"), 0, "linear timing function is forbidden");
        assertEq(_countOccurrences(svg, "cubic-bezier"), 0, "cubic-bezier timing function is forbidden");
        assertEq(_countOccurrences(svg, "steps("), 0, "steps() timing function is forbidden");
        // `ease-in`, `ease-out`, and bare `ease` are substrings of `ease-in-out`; to
        // detect them standalone we match the non-ambiguous delimited forms that
        // would indicate a different timing function than `ease-in-out`.
        assertEq(_countOccurrences(svg, " ease;"), 0, "bare ease timing function is forbidden");
        assertEq(_countOccurrences(svg, " ease "), 0, "bare ease timing function is forbidden");
        assertEq(_countOccurrences(svg, " ease-in;"), 0, "ease-in timing function is forbidden");
        assertEq(_countOccurrences(svg, " ease-in "), 0, "ease-in timing function is forbidden");
        assertEq(_countOccurrences(svg, " ease-out;"), 0, "ease-out timing function is forbidden");
        assertEq(_countOccurrences(svg, " ease-out "), 0, "ease-out timing function is forbidden");
    }

    // --- 8. Python-parity fixture — pinned-value regression guard -----------------
    //
    // The earlier drift tests verify invariants (slow pool, distinct, no third grammar,
    // etc.) but an implementation that satisfies every invariant could still drift from
    // the reference Python injector's exact derivation (e.g. by subtly changing pool
    // semantics or swapping Teschner primes for "equivalent" ones). This test locks
    // exact byte-level parity for one canonical input.
    //
    // Inputs are crafted so that `identityHash[4..9]` have predictable values:
    //   b4=0xFF, b5=0x00, b6=0x80, b7=0x40, b8=0xC0, b9=0x20
    //
    // Per the contract's `_shapeX`/`_shapeY` / `_circleCx`/`_circleCy`:
    //   c0: (384, 54)   c1: (210, 107)   c2: (298, 80)
    //
    // Per the Teschner mix + order-preserving pool prune (pool starts (29,31,37,41,43,47,53,59,61,67,71)):
    //   c0 → period=47, delay=1
    //   c1 → period=43, delay=28
    //   c2 → period=59, delay=28
    //
    // These six values were cross-verified 2026-04-18 against the historical Python
    // injector with the same (cx, cy, i) triples — contract output == Python output
    // byte-for-byte. A reproducer is trivial: run the mix + pool-prune against
    // (384,54,0), (210,107,1), (298,80,2).
    //
    // A failure here means either:
    //   (a) a multiplier or pool change broke parity with the archived reference,
    //   (b) `_shapeX`/`_shapeY` changed (shifting circle centers), or
    //   (c) `_circleCx`/`_circleCy` diverged from the identityHash[4..9] mapping.
    // Any of those needs conversation, not a fixture update.

    bytes32 internal constant PARITY_FIXTURE_IDENTITY_HASH =
        0x00000000FF008040C02000000000000000000000000000000000000000000000;

    function test_tokenURI_pythonParity_pinnedFixture() public {
        string memory svg = _renderSvg(1, PARITY_FIXTURE_IDENTITY_HASH);
        (uint256 p0, uint256 p1, uint256 p2, uint256 d0, uint256 d1, uint256 d2) = _parseAllDriftTriples(svg);

        emit log_named_uint("fixture c0 period", p0);
        emit log_named_uint("fixture c0 delay", d0);
        emit log_named_uint("fixture c1 period", p1);
        emit log_named_uint("fixture c1 delay", d1);
        emit log_named_uint("fixture c2 period", p2);
        emit log_named_uint("fixture c2 delay", d2);

        // DO NOT "fix" these by just updating numbers if they diverge. The whole
        // point of this test is that these exact values encode the reference
        // Python injector's derivation for the given identityHash. A divergence
        // means drift derivation semantics changed — escalate before touching
        // the pin. See `docs/onchain/renderer.md` § Background circle drift for
        // the canonical mix and pool rules.
        assertEq(p0, 47, "c0 period mismatch (Python parity fixture)");
        assertEq(d0,  1, "c0 delay mismatch (Python parity fixture)");
        assertEq(p1, 43, "c1 period mismatch (Python parity fixture)");
        assertEq(d1, 28, "c1 delay mismatch (Python parity fixture)");
        assertEq(p2, 59, "c2 period mismatch (Python parity fixture)");
        assertEq(d2, 28, "c2 delay mismatch (Python parity fixture)");
    }

    // =============================================================================
    //                                  Helpers
    // =============================================================================

    function _renderSvg(uint256 tokenId, bytes32 identityHash) internal returns (string memory) {
        IBuddyNFT.BuddyTraits memory traits;
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

        mockBuddy.setTraits(tokenId, traits);
        mockBuddy.setName(tokenId, "");
        mockBuddy.setIdentityHash(tokenId, identityHash);
        mockBuddy.setPrngSeed(tokenId, uint32(uint256(identityHash)));
        mockBuddy.setStage(tokenId, IBuddyNFT.OwnershipStage.Custodial);

        string memory tokenUri = renderer.tokenURI(address(mockBuddy), tokenId);
        string memory json = string(Base64.decode(_afterPrefix(tokenUri, JSON_PREFIX)));
        return string(Base64.decode(_afterPrefix(json.readString(".image"), SVG_PREFIX)));
    }

    function _isInSlowPool(uint256 period) internal view returns (bool) {
        for (uint256 k = 0; k < slowPool.length; ++k) {
            if (slowPool[k] == period) {
                return true;
            }
        }
        return false;
    }

    /// @dev Parses `#cN{animation:driftN <period>s infinite ease-in-out;animation-delay:-<delay>s}`
    ///      out of the rendered SVG. Returns (period, delay) for circle index i.
    function _parseDriftTriple(string memory svg, uint8 i) internal pure returns (uint256 period, uint256 delay) {
        bytes memory svgBytes = bytes(svg);
        bytes1 idDigit = DECIMAL_DIGITS[uint256(i)];

        // Anchor: `#cN{animation:driftN `.
        bytes memory anchor = abi.encodePacked("#c", idDigit, "{animation:drift", idDigit, " ");

        uint256 start = _indexOf(svgBytes, anchor, 0);
        require(start != type(uint256).max, "missing drift anchor");
        uint256 cursor = start + anchor.length;

        // Parse `<period>s`.
        uint256 periodEnd = cursor;
        while (periodEnd < svgBytes.length && svgBytes[periodEnd] != ASCII_S) {
            ++periodEnd;
        }
        period = _parseUintSpan(svgBytes, cursor, periodEnd);

        // Skip to `animation-delay:-<delay>s`.
        bytes memory delayAnchor = bytes("animation-delay:-");
        uint256 delayStart = _indexOf(svgBytes, delayAnchor, periodEnd);
        require(delayStart != type(uint256).max, "missing delay anchor");
        uint256 delayCursor = delayStart + delayAnchor.length;
        uint256 delayEnd = delayCursor;
        while (delayEnd < svgBytes.length && svgBytes[delayEnd] != ASCII_S) {
            ++delayEnd;
        }
        delay = _parseUintSpan(svgBytes, delayCursor, delayEnd);
    }

    function _parseAllDriftTriples(string memory svg)
        internal
        pure
        returns (uint256 p0, uint256 p1, uint256 p2, uint256 d0, uint256 d1, uint256 d2)
    {
        (p0, d0) = _parseDriftTriple(svg, 0);
        (p1, d1) = _parseDriftTriple(svg, 1);
        (p2, d2) = _parseDriftTriple(svg, 2);
    }

    function _parseUintSpan(bytes memory source, uint256 start, uint256 endExclusive)
        internal
        pure
        returns (uint256 value)
    {
        for (uint256 i = start; i < endExclusive; ++i) {
            uint8 digit = uint8(source[i]);
            require(digit >= 0x30 && digit <= 0x39, "non-digit in uint span");
            value = value * 10 + (digit - 0x30);
        }
    }

    function _afterPrefix(string memory value, string memory prefix) internal pure returns (string memory) {
        bytes memory valueBytes = bytes(value);
        bytes memory prefixBytes = bytes(prefix);
        require(valueBytes.length >= prefixBytes.length, "shorter than prefix");
        for (uint256 i = 0; i < prefixBytes.length; ++i) {
            require(valueBytes[i] == prefixBytes[i], "prefix mismatch");
        }
        bytes memory tail = new bytes(valueBytes.length - prefixBytes.length);
        for (uint256 i = 0; i < tail.length; ++i) {
            tail[i] = valueBytes[i + prefixBytes.length];
        }
        return string(tail);
    }

    function _contains(string memory haystack, string memory needle) internal pure returns (bool) {
        return _indexOf(bytes(haystack), bytes(needle), 0) != type(uint256).max;
    }

    function _containsBytes(bytes memory haystack, bytes memory needle) internal pure returns (bool) {
        return _indexOf(haystack, needle, 0) != type(uint256).max;
    }

    function _countOccurrences(string memory haystack, string memory needle) internal pure returns (uint256 count) {
        bytes memory haystackBytes = bytes(haystack);
        bytes memory needleBytes = bytes(needle);
        if (needleBytes.length == 0 || needleBytes.length > haystackBytes.length) {
            return 0;
        }
        for (uint256 i = 0; i <= haystackBytes.length - needleBytes.length; ++i) {
            bool match_ = true;
            for (uint256 j = 0; j < needleBytes.length; ++j) {
                if (haystackBytes[i + j] != needleBytes[j]) {
                    match_ = false;
                    break;
                }
            }
            if (match_) {
                ++count;
            }
        }
    }

    function _indexOf(bytes memory haystack, bytes memory needle, uint256 from) internal pure returns (uint256) {
        if (needle.length == 0 || haystack.length < needle.length) {
            return type(uint256).max;
        }
        for (uint256 i = from; i <= haystack.length - needle.length; ++i) {
            bool match_ = true;
            for (uint256 j = 0; j < needle.length; ++j) {
                if (haystack[i + j] != needle[j]) {
                    match_ = false;
                    break;
                }
            }
            if (match_) {
                return i;
            }
        }
        return type(uint256).max;
    }
}
