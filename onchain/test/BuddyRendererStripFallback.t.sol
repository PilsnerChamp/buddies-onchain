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

/// @notice Coverage for the `<style>`-stripping fallback. The rendered SVG
///         must remain legible when a wallet or embedded renderer removes the `<style>`
///         block — required attributes ride either directly on each `<text>` element or
///         on an ancestor `<g>` (hoisting tolerance).
contract BuddyRendererStripFallbackTest is Test {
    using stdJson for string;

    string internal constant JSON_PREFIX = "data:application/json;base64,";
    string internal constant SVG_PREFIX = "data:image/svg+xml;base64,";
    bytes internal constant DECIMAL_DIGITS = "0123456789";

    bytes1 internal constant ASCII_QUOTE = 0x22;
    bytes1 internal constant ASCII_SPACE = 0x20;
    bytes1 internal constant ASCII_SLASH = 0x2f;
    bytes1 internal constant ASCII_LT = 0x3c;
    bytes1 internal constant ASCII_GT = 0x3e;
    bytes1 internal constant ASCII_G = 0x67;

    BuddySpriteData internal spriteData;
    BuddyFont internal buddyFont;
    BuddySpriteFont internal buddySpriteFont;
    BuddyRenderer internal renderer;
    MockBuddyNFTForRenderer internal mockBuddy;

    function setUp() public {
        spriteData = new BuddySpriteData();
        buddyFont = new BuddyFont(vm.readFileBinary("contract-data/fonts/chrome/BuddyFont.woff2"));
        buddySpriteFont = new BuddySpriteFont(vm.readFileBinary("contract-data/fonts/sprite/BuddySpriteFont.woff2"));
        renderer = new BuddyRenderer(address(spriteData), address(buddyFont), address(buddySpriteFont));
        mockBuddy = new MockBuddyNFTForRenderer();
    }

    // --- Test 1: strip-fallback legibility for a non-shiny fixture -----------------

    function test_renderer_strippedFallback_legibility() public {
        IBuddyNFT.BuddyTraits memory traits;
        traits.species = 13; // Cactus — matches `stripped-but-looks-good.svg` reference
        traits.rarity = 1;   // Uncommon
        traits.eyes = 4;     // `@` glyph
        traits.hat = 0;
        traits.shiny = false;
        traits.debugging = 50;
        traits.patience = 7;
        traits.chaos = 28;
        traits.wisdom = 50;
        traits.snark = 74;

        _setMockToken(1, traits, "", bytes32(uint256(0xCAC7051D)), IBuddyNFT.OwnershipStage.Custodial);
        string memory rich = _decodeSvgFromTokenUri(renderer.tokenURI(address(mockBuddy), 1));
        string memory stripped = _stripStyleBlock(rich);

        // Pre-condition: `<style>` must be gone in the stripped input. Paranoia against
        // a helper regression silently turning this test into a rich-mode test.
        assertFalse(_contains(stripped, "<style>"), "strip helper left a <style> behind");
        assertFalse(_contains(stripped, "</style>"), "strip helper left a </style> behind");

        // Every chrome `<text class="stat">` has font-family="monospace" on self-or-ancestor.
        _assertEveryTextHasEffectiveAttribute(
            stripped,
            'class="stat"',
            'font-family="monospace"'
        );
        // Every sprite `<text class="sprite">` has font-family="monospace" on self-or-ancestor.
        _assertEveryTextHasEffectiveAttribute(
            stripped,
            'class="sprite"',
            'font-family="monospace"'
        );

        // Chrome fill and sprite fill live on self-or-ancestor.
        _assertEveryTextHasEffectiveAttribute(stripped, 'class="stat"', 'fill="#cbd5e1"');
        _assertEveryTextHasEffectiveAttribute(stripped, 'class="sprite"', 'fill="#e2e8f0"');

        // Chrome `<text>` nodes carry `font-size` directly — font-size is
        // non-hoistable across chrome/sprite tiers (chrome=18, sprite=37).
        // Sprite `<text>` nodes inherit `font-size="37"` from their immediate
        // `<g id="fN">` parent. See `docs/onchain/renderer.md` § Chrome
        // `font-size` placement. The assertion tolerates
        // self-or-direct-`<g id="fN">`-parent for sprite and self-only for chrome.
        _assertChromeTextHasFontSizeAttribute(stripped);
        _assertSpriteTextHasFontSizeOnFrameGroup(stripped);
        assertFalse(
            _contains(stripped, 'style="font-size'),
            "font-size must live as an attribute, not inside style="
        );

        // Chrome prompt / rules / footer drop `xml:space`; only the title row at
        // y=56 retains it. Sprite `<text>` nodes keep `xml:space="preserve"`
        // self-only for stripper compatibility.
        _assertNoXmlSpaceOnUntitledChromeRows(stripped);
        _assertXmlSpaceOnEverySpriteText(stripped);

        // Background rect carries the paint-fallback HSL triple.
        assertTrue(
            _contains(stripped, 'fill="url(#bg) hsl('),
            "background rect is missing the paint-fallback hsl(...) triple"
        );

        // Exactly three pinned-width `<text>` nodes, one per full-width chrome line.
        bytes memory pinAttr = bytes('textLength="388" lengthAdjust="spacingAndGlyphs"');
        assertEq(
            _countOccurrences(stripped, string(pinAttr)),
            3,
            "expected exactly 3 pinned-width chrome lines"
        );
        // Each pinned line lives on y=82 / y=372 / y=398 respectively. These rows
        // drop `xml:space`, so the pinned-attr tail
        // ends at the opening `>` rather than `xml:space="preserve">`.
        assertTrue(
            _contains(stripped, ' y="82" font-size="18" textLength="388" lengthAdjust="spacingAndGlyphs">'),
            "top rule must carry textLength/lengthAdjust"
        );
        assertTrue(
            _contains(stripped, ' y="372" font-size="18" textLength="388" lengthAdjust="spacingAndGlyphs">'),
            "bottom rule must carry textLength/lengthAdjust"
        );
        assertTrue(
            _contains(stripped, ' y="398" font-size="18" textLength="388" lengthAdjust="spacingAndGlyphs">'),
            "footer must carry textLength/lengthAdjust"
        );
    }

    // --- Test 2: shiny tspan carries inline fill + bold ----------------------------

    function test_renderer_shinyFallback() public {
        IBuddyNFT.BuddyTraits memory traits;
        traits.species = 12; // Capybara
        traits.rarity = 4;   // Legendary
        traits.eyes = 1;
        traits.hat = 0;
        traits.shiny = true;
        traits.debugging = 16;
        traits.patience = 27;
        traits.chaos = 3;
        traits.wisdom = 75;
        traits.snark = 35;

        _setMockToken(1, traits, "", bytes32(uint256(0x5411144)), IBuddyNFT.OwnershipStage.Custodial);
        string memory rich = _decodeSvgFromTokenUri(renderer.tokenURI(address(mockBuddy), 1));
        string memory stripped = _stripStyleBlock(rich);

        // `<style>` must really be gone.
        assertFalse(_contains(stripped, "<style>"), "strip helper left a <style> behind");

        // Scan for a single <tspan> that carries BOTH fill="#FFC107" AND font-weight="bold"
        // as attributes. Order within the opening tag is an implementation choice of the
        // renderer; we just require both attrs to appear between `<tspan ` and `>`.
        bytes memory svgBytes = bytes(stripped);
        uint256 cursor = 0;
        bool foundTspan = false;
        bytes memory openMarker = bytes("<tspan ");

        while (true) {
            uint256 openAt = _indexOf(svgBytes, openMarker, cursor);
            if (openAt == type(uint256).max) {
                break;
            }
            uint256 closeAt = _indexOf(svgBytes, bytes(">"), openAt);
            require(closeAt != type(uint256).max, "unterminated <tspan");

            string memory tspanOpen = _slice(svgBytes, openAt, closeAt + 1);
            if (
                _contains(tspanOpen, 'fill="#FFC107"')
                    && _contains(tspanOpen, 'font-weight="bold"')
            ) {
                foundTspan = true;
                break;
            }
            cursor = closeAt + 1;
        }

        assertTrue(
            foundTspan,
            "shiny <tspan> must carry both fill=\"#FFC107\" and font-weight=\"bold\" as attributes"
        );
    }

    // --- Test 3: background fallback short-arc hue midpoint ------------------------

    function test_renderer_backgroundFallback_midpoint() public {
        // Pinned-fixture inputs. The traits below plus the hash seed the derivations
        // `_baseHue(identityHash, species)` and `_baseSaturation(rarity, species)` per
        // `BuddyRenderer.sol` and produce the HSL triple we recompute here.
        IBuddyNFT.BuddyTraits memory traits;
        traits.species = 0;  // Duck
        traits.rarity = 2;   // Rare
        traits.eyes = 0;
        traits.hat = 5;
        traits.shiny = false;
        traits.debugging = 10;
        traits.patience = 20;
        traits.chaos = 30;
        traits.wisdom = 40;
        traits.snark = 50;

        bytes32 identityHash = bytes32(uint256(0xABCDEF0102030405));
        _setMockToken(1, traits, "", identityHash, IBuddyNFT.OwnershipStage.Custodial);

        string memory svg = _decodeSvgFromTokenUri(renderer.tokenURI(address(mockBuddy), 1));

        // Compute expected HSL midpoint off-chain — mirrors the `_backgroundFallbackColor`
        // formula (see `docs/onchain/renderer.md` § Background paint fallback).
        uint256 startHue = _expectedBaseHue(identityHash, traits.species);
        uint256 startSat = _expectedBaseSaturation(traits.rarity, traits.species);
        uint256 endHue = (startHue + 42 + (uint256(traits.species) * 3)) % 360;
        uint256 endSat = startSat + 8;
        uint256 endLight = 24 + (uint256(traits.rarity) * 2);
        uint256 startLight = 15;

        uint256 midHue = _expectedShortArcMidHue(startHue, endHue);
        uint256 midSat = (startSat + endSat) / 2;
        uint256 midLight = (startLight + endLight) / 2;

        string memory expectedHsl = string.concat(
            "hsl(",
            _u2s(midHue),
            ",",
            _u2s(midSat),
            "%,",
            _u2s(midLight),
            "%)"
        );

        // The rect must carry `fill="url(#bg) <expectedHsl>"`.
        string memory expectedRectFill = string.concat('fill="url(#bg) ', expectedHsl, '"');
        assertTrue(
            _contains(svg, expectedRectFill),
            string.concat("rect is missing expected paint-fallback: ", expectedRectFill)
        );
    }

    // =============================================================================
    //  Output-minimization tests
    // =============================================================================

    /// @dev Only the title row at y=56 retains `xml:space`. The
    ///      shiny tspan's trailing space inside `SHINY_PREFIX` would collapse under
    ///      SVG default whitespace handling without this.
    function test_renderer_noXmlSpaceOnChromeExceptTitle() public {
        _setMockToken(
            1,
            _defaultTraits(),
            "",
            bytes32(uint256(0x13B0)),
            IBuddyNFT.OwnershipStage.Custodial
        );
        string memory svg = _decodeSvgFromTokenUri(renderer.tokenURI(address(mockBuddy), 1));

        // Sprite `<text>` retains xml:space self-only for stripper compatibility.
        _assertXmlSpaceOnEverySpriteText(svg);

        // Chrome: only y=56 (title) has xml:space; prompt/rules/footer do not.
        _assertNoXmlSpaceOnUntitledChromeRows(svg);

        // Positive assertion — the y=56 chrome row actually carries xml:space.
        assertTrue(
            _contains(svg, ' y="56" font-size="18" xml:space="preserve"'),
            "title row must carry xml:space=preserve"
        );
    }

    /// @dev `font-size="37"` is hoisted onto the `<g id="fN">` frame
    ///      group. Self-only check on sprite text fails (no font-size attr); the
    ///      immediate frame-group parent must carry it. Strict on direct parent — a
    ///      hoist to any outer-outer ancestor must fail this test.
    function test_renderer_spriteFontSizeHoisted() public {
        _setMockToken(
            1,
            _defaultTraits(),
            "",
            bytes32(uint256(0x13A0)),
            IBuddyNFT.OwnershipStage.Custodial
        );
        string memory svg = _decodeSvgFromTokenUri(renderer.tokenURI(address(mockBuddy), 1));

        // No sprite text carries font-size directly.
        bytes memory svgBytes = bytes(svg);
        bytes memory textOpen = bytes("<text ");
        uint256 cursor = 0;
        uint256 spriteCount = 0;
        while (true) {
            uint256 openAt = _indexOf(svgBytes, textOpen, cursor);
            if (openAt == type(uint256).max) break;
            uint256 closeAt = _indexOf(svgBytes, bytes(">"), openAt);
            require(closeAt != type(uint256).max, "unterminated <text");
            string memory tagText = _slice(svgBytes, openAt, closeAt + 1);
            cursor = closeAt + 1;
            if (!_contains(tagText, 'class="sprite"')) continue;
            ++spriteCount;
            assertFalse(
                _contains(tagText, 'font-size'),
                "sprite <text> must NOT carry font-size directly"
            );
            // Must live on immediate `<g id="fN">` parent — not some outer ancestor.
            assertTrue(
                _immediateFrameGroupCarriesAttr(svgBytes, openAt, 'font-size="37"'),
                "sprite <text>'s immediate <g id='fN'> parent must carry font-size='37'"
            );
        }
        assertEq(spriteCount, 20, "expected 20 sprite text nodes (4 frames * 5 rows)");

        // Positive assertion on each frame group.
        assertTrue(_contains(svg, '<g id="f0" fill="#e2e8f0" font-size="37"'));
        assertTrue(_contains(svg, '<g id="f1" fill="#e2e8f0" font-size="37"'));
        assertTrue(_contains(svg, '<g id="f2" fill="#e2e8f0" font-size="37"'));
        assertTrue(_contains(svg, '<g id="fb" fill="#e2e8f0" font-size="37"'));
    }

    /// @dev `<rect>`, `<circle>`, `<stop>` all self-close. No
    ///      `<rect ...></rect>`, `<circle ...></circle>`, `<stop ...></stop>` pairs.
    function test_renderer_emptyElementsSelfClosed() public {
        _setMockToken(
            1,
            _defaultTraits(),
            "",
            bytes32(uint256(0x13C0)),
            IBuddyNFT.OwnershipStage.Custodial
        );
        string memory svg = _decodeSvgFromTokenUri(renderer.tokenURI(address(mockBuddy), 1));

        assertFalse(_contains(svg, "></rect>"), "<rect> must self-close");
        assertFalse(_contains(svg, "></circle>"), "<circle> must self-close");
        assertFalse(_contains(svg, "></stop>"), "<stop> must self-close");
    }

    /// @dev Four gradient presets emit minimized attribute sets.
    ///      Preset 2 specifically emits `<linearGradient id="bg">` with NO trailing
    ///      space (proves the `_backgroundDefs` spacer cleanup landed).
    function test_renderer_gradientVectorSimplified() public {
        // `identityHash[3]` drives the preset via `% 4`. Byte 3 of the hash is the
        // fourth-from-MSB byte of the `bytes32` (bytes31 is LSB in Solidity layout).
        // We need identityHash such that identityHash[3] % 4 == target preset.
        // Construct hashes with byte 3 = 0x00 / 0x01 / 0x02 / 0x03.
        bytes32[4] memory hashes = [
            bytes32(uint256(0x00112200_00000000_00000000_00000000_00000000_00000000_00000000_00000000)),
            bytes32(uint256(0x00112201_00000000_00000000_00000000_00000000_00000000_00000000_00000000)),
            bytes32(uint256(0x00112202_00000000_00000000_00000000_00000000_00000000_00000000_00000000)),
            bytes32(uint256(0x00112203_00000000_00000000_00000000_00000000_00000000_00000000_00000000))
        ];
        string[4] memory expectedOpens = [
            '<linearGradient id="bg" y2="100%">',
            '<linearGradient id="bg" x1="100%" x2="0%" y2="100%">',
            '<linearGradient id="bg">',
            '<linearGradient id="bg" x2="0%" y2="100%">'
        ];

        for (uint256 i = 0; i < 4; ++i) {
            // Sanity: byte 3 is indeed i, so `identityHash[3] % 4 == i`.
            assertEq(uint256(uint8(hashes[i][3])), i);

            _setMockToken(
                1,
                _defaultTraits(),
                "",
                hashes[i],
                IBuddyNFT.OwnershipStage.Custodial
            );
            string memory svg = _decodeSvgFromTokenUri(renderer.tokenURI(address(mockBuddy), 1));
            assertTrue(
                _contains(svg, expectedOpens[i]),
                string.concat("preset ", _u2s(i), " gradient open tag mismatch: expected ", expectedOpens[i])
            );
            // Preset 2: explicitly assert there is no trailing space form.
            if (i == 2) {
                assertFalse(
                    _contains(svg, '<linearGradient id="bg" >'),
                    "preset 2 must emit `<linearGradient id=\"bg\">` with NO trailing space"
                );
            }
        }
    }

    /// @dev Accent circles emit a single merged `fill="hsla(...)"`
    ///      with no separate `fill-opacity` attribute.
    function test_renderer_circleFillIsHsla() public {
        _setMockToken(
            1,
            _defaultTraits(),
            "",
            bytes32(uint256(0x13E0)),
            IBuddyNFT.OwnershipStage.Custodial
        );
        string memory svg = _decodeSvgFromTokenUri(renderer.tokenURI(address(mockBuddy), 1));

        // Every accent circle uses hsla(). No standalone fill-opacity attrs survive.
        assertEq(_countOccurrences(svg, 'fill="hsla('), 3, "3 accent circles must fill with hsla()");
        assertFalse(_contains(svg, "fill-opacity"), "fill-opacity merged into hsla()");
    }

    /// @dev Shiny tspan drops `class="shiny-label"` — inline `fill` +
    ///      `font-weight` attrs alone drive rendering.
    function test_renderer_shinyTspanHasNoClass() public {
        IBuddyNFT.BuddyTraits memory traits = _defaultTraits();
        traits.shiny = true;
        _setMockToken(1, traits, "", bytes32(uint256(0x13F0)), IBuddyNFT.OwnershipStage.Custodial);
        string memory svg = _decodeSvgFromTokenUri(renderer.tokenURI(address(mockBuddy), 1));

        assertTrue(
            _contains(svg, '<tspan fill="#FFC107" font-weight="bold">'),
            "shiny tspan must carry inline fill + font-weight"
        );
        assertFalse(
            _contains(svg, 'class="shiny-label"'),
            "shiny tspan must NOT carry class='shiny-label'"
        );
    }

    /// @dev Shiny-title whitespace guard: the trailing space in `SHINY_PREFIX`
    ///      (`✦SHINY✦ `) must survive into the rendered SVG. Catches a regression
    ///      that drops `xml:space="preserve"` from the title row — SVG default
    ///      whitespace handling would collapse `✦SHINY✦ LEGENDARY` to `✦SHINY✦LEGENDARY`.
    function test_renderer_shinyTitleSpacePreserved() public {
        IBuddyNFT.BuddyTraits memory traits = _defaultTraits();
        traits.shiny = true;
        traits.rarity = 4; // Legendary
        _setMockToken(1, traits, "", bytes32(uint256(0x13F1)), IBuddyNFT.OwnershipStage.Custodial);
        string memory svg = _decodeSvgFromTokenUri(renderer.tokenURI(address(mockBuddy), 1));

        // `✦SHINY✦ ` with trailing space, followed by `LEGENDARY`.
        assertTrue(
            _contains(svg, unicode"✦SHINY✦ </tspan>LEGENDARY"),
            "shiny prefix must keep trailing space before LEGENDARY"
        );
        // Title row must carry xml:space (otherwise the space would collapse).
        assertTrue(
            _contains(svg, ' y="56" font-size="18" xml:space="preserve"'),
            "title row must retain xml:space=preserve"
        );
    }

    /// @dev `TEXT_STYLE_CSS` constant no longer carries the `.shiny-label` rule.
    ///      Probed via the rendered SVG (CSS ends up inside the `<style>` block
    ///      alongside font + animation rules).
    function test_renderer_textStyleCssHasNoShinyLabelRule() public {
        // Test on a SHINY token — regression where the renderer conditionally emits
        // the class on shiny render would escape a non-shiny smoke test.
        IBuddyNFT.BuddyTraits memory traits = _defaultTraits();
        traits.shiny = true;
        _setMockToken(1, traits, "", bytes32(uint256(0x13F2)), IBuddyNFT.OwnershipStage.Custodial);
        string memory svg = _decodeSvgFromTokenUri(renderer.tokenURI(address(mockBuddy), 1));

        // TEXT_STYLE_CSS content: check for both the CSS selector `.shiny-label{` and
        // the bare name `.shiny-label`. Neither should appear in the style block.
        assertFalse(_contains(svg, ".shiny-label"), "TEXT_STYLE_CSS must not carry .shiny-label");
    }

    // =============================================================================
    //                                  Helpers
    // =============================================================================

    function _defaultTraits() internal pure returns (IBuddyNFT.BuddyTraits memory traits) {
        traits.species = 1; // Goose — matches the amendment's normalized reference SVG
        traits.rarity = 1;  // Uncommon
        traits.eyes = 0;
        traits.hat = 5;
        traits.shiny = false;
        traits.debugging = 50;
        traits.patience = 50;
        traits.chaos = 50;
        traits.wisdom = 50;
        traits.snark = 50;
    }

    function _setMockToken(
        uint256 tokenId,
        IBuddyNFT.BuddyTraits memory traits,
        string memory name,
        bytes32 identityHash,
        IBuddyNFT.OwnershipStage stage
    )
        internal
    {
        mockBuddy.setTraits(tokenId, traits);
        mockBuddy.setName(tokenId, name);
        mockBuddy.setIdentityHash(tokenId, identityHash);
        mockBuddy.setPrngSeed(tokenId, uint32(uint256(identityHash)));
        mockBuddy.setStage(tokenId, stage);
    }

    function _decodeSvgFromTokenUri(string memory tokenUri) internal pure returns (string memory) {
        string memory json = string(Base64.decode(_afterPrefix(tokenUri, JSON_PREFIX)));
        string memory imageUri = _readStringField(json, '"image":"');
        return string(Base64.decode(_afterPrefix(imageUri, SVG_PREFIX)));
    }

    function _readStringField(string memory json, string memory keyQuoted) internal pure returns (string memory) {
        bytes memory jsonBytes = bytes(json);
        bytes memory keyBytes = bytes(keyQuoted);
        uint256 start = _indexOf(jsonBytes, keyBytes, 0);
        require(start != type(uint256).max, "json field missing");
        uint256 valueStart = start + keyBytes.length;
        uint256 valueEnd = valueStart;
        while (valueEnd < jsonBytes.length && jsonBytes[valueEnd] != ASCII_QUOTE) {
            ++valueEnd;
        }
        bytes memory out = new bytes(valueEnd - valueStart);
        for (uint256 i = 0; i < out.length; ++i) {
            out[i] = jsonBytes[valueStart + i];
        }
        return string(out);
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

    /// @dev Removes everything from `<style>` through `</style>` inclusive so downstream
    ///      assertions observe only what a `<style>`-stripping renderer would see.
    function _stripStyleBlock(string memory svg) internal pure returns (string memory) {
        bytes memory svgBytes = bytes(svg);
        bytes memory openMarker = bytes("<style>");
        bytes memory closeMarker = bytes("</style>");

        uint256 openAt = _indexOf(svgBytes, openMarker, 0);
        if (openAt == type(uint256).max) {
            return svg;
        }
        uint256 closeAt = _indexOf(svgBytes, closeMarker, openAt);
        require(closeAt != type(uint256).max, "no </style>");
        uint256 endInclusive = closeAt + closeMarker.length;

        bytes memory out = new bytes(svgBytes.length - (endInclusive - openAt));
        uint256 w;
        for (uint256 i = 0; i < openAt; ++i) {
            out[w++] = svgBytes[i];
        }
        for (uint256 i = endInclusive; i < svgBytes.length; ++i) {
            out[w++] = svgBytes[i];
        }
        return string(out);
    }

    /// @dev Walks every `<text ... classMarker ...>` occurrence and asserts that
    ///      `needleAttr` appears either on the text element's own opening tag OR on
    ///      some ancestor `<g>` that encloses it. Built for self-or-ancestor
    ///      tolerance — the attribute may live on the outer `<g>` wrapper rather than
    ///      each text node. See `docs/onchain/renderer.md` § Stripping fallbacks.
    function _assertEveryTextHasEffectiveAttribute(
        string memory svg,
        string memory classMarker,
        string memory needleAttr
    )
        internal
        pure
    {
        bytes memory svgBytes = bytes(svg);
        bytes memory textOpen = bytes("<text ");
        uint256 cursor = 0;
        while (true) {
            uint256 openAt = _indexOf(svgBytes, textOpen, cursor);
            if (openAt == type(uint256).max) {
                break;
            }
            uint256 closeAt = _indexOf(svgBytes, bytes(">"), openAt);
            require(closeAt != type(uint256).max, "unterminated <text");

            string memory tagText = _slice(svgBytes, openAt, closeAt + 1);
            cursor = closeAt + 1;

            if (!_contains(tagText, classMarker)) {
                continue;
            }

            // Self check.
            if (_contains(tagText, needleAttr)) {
                continue;
            }

            // Ancestor check — walk backwards through enclosing `<g ...>` tags until the
            // SVG root; at least one must carry the attribute.
            bool ancestorHas = _anyAncestorGroupHasAttribute(svgBytes, openAt, needleAttr);
            require(
                ancestorHas,
                string.concat(
                    "no self-or-ancestor attribute ",
                    needleAttr,
                    " on a <text> with ",
                    classMarker
                )
            );
        }
    }

    /// @dev Chrome `<text class="stat">` nodes must carry `font-size` directly —
    ///      chrome (18) and sprite (37) differ so font-size cannot hoist onto the
    ///      outer chrome `<g>` (see `docs/onchain/renderer.md` § Chrome `font-size`
    ///      placement). Self-only assertion catches a regression that moves chrome
    ///      font-size onto any ancestor.
    function _assertChromeTextHasFontSizeAttribute(string memory svg) internal pure {
        bytes memory svgBytes = bytes(svg);
        bytes memory textOpen = bytes("<text ");
        uint256 cursor = 0;
        while (true) {
            uint256 openAt = _indexOf(svgBytes, textOpen, cursor);
            if (openAt == type(uint256).max) {
                break;
            }
            uint256 closeAt = _indexOf(svgBytes, bytes(">"), openAt);
            require(closeAt != type(uint256).max, "unterminated <text");

            string memory tagText = _slice(svgBytes, openAt, closeAt + 1);
            cursor = closeAt + 1;

            if (!_contains(tagText, 'class="stat"')) {
                continue;
            }
            require(
                _contains(tagText, 'font-size="'),
                "chrome <text> must carry font-size directly (docs/onchain/renderer.md)"
            );
        }
    }

    /// @dev Sprite `font-size="37"` is hoisted onto the immediate `<g id="fN">`
    ///      parent. Assertion: every sprite `<text>` either
    ///      carries `font-size="37"` itself (regression) OR its immediate `<g id="fN">`
    ///      parent does. Must NOT match on outer ancestors — that would allow future
    ///      regressions hoisting font-size onto the chrome-tier `<g>`.
    function _assertSpriteTextHasFontSizeOnFrameGroup(string memory svg) internal pure {
        bytes memory svgBytes = bytes(svg);
        bytes memory textOpen = bytes("<text ");
        uint256 cursor = 0;
        while (true) {
            uint256 openAt = _indexOf(svgBytes, textOpen, cursor);
            if (openAt == type(uint256).max) {
                break;
            }
            uint256 closeAt = _indexOf(svgBytes, bytes(">"), openAt);
            require(closeAt != type(uint256).max, "unterminated <text");

            string memory tagText = _slice(svgBytes, openAt, closeAt + 1);
            cursor = closeAt + 1;

            if (!_contains(tagText, 'class="sprite"')) {
                continue;
            }

            // Self check — any future regression that re-inlines font-size on sprite
            // text still passes, but we prefer it on the group. Either is acceptable.
            if (_contains(tagText, 'font-size="37"')) {
                continue;
            }

            // Walk backward to the nearest enclosing `<g id="fN"` and require it
            // carry `font-size="37"`. Fails if a later hoist moved font-size onto a
            // broader ancestor.
            bool ok = _immediateFrameGroupCarriesAttr(svgBytes, openAt, 'font-size="37"');
            require(
                ok,
                "sprite <text> needs font-size='37' on itself or its <g id='fN'> parent"
            );
        }
    }

    /// @dev Scans backward from `anchorOffset` to the nearest unclosed `<g id="fN"`
    ///      frame-group open tag and checks if it carries `needleAttr`. Returns false
    ///      if the nearest enclosing group is not a frame group (a different hoist
    ///      destination), catching any regression that tries to hoist past `<g id="fN">`.
    function _immediateFrameGroupCarriesAttr(
        bytes memory svgBytes,
        uint256 anchorOffset,
        string memory needleAttr
    )
        internal
        pure
        returns (bool)
    {
        int256 depth = 0;
        uint256 i = anchorOffset;
        while (i > 0) {
            --i;
            if (
                i + 3 <= svgBytes.length
                    && svgBytes[i] == ASCII_LT && svgBytes[i + 1] == ASCII_SLASH && svgBytes[i + 2] == ASCII_G
            ) {
                depth += 1;
                continue;
            }
            if (
                i + 3 <= svgBytes.length
                    && svgBytes[i] == ASCII_LT && svgBytes[i + 1] == ASCII_G
                    && (svgBytes[i + 2] == ASCII_SPACE || svgBytes[i + 2] == ASCII_GT)
            ) {
                if (depth == 0) {
                    uint256 closeAt = _indexOf(svgBytes, bytes(">"), i);
                    if (closeAt == type(uint256).max || closeAt > anchorOffset) {
                        return false;
                    }
                    string memory tagText = _slice(svgBytes, i, closeAt + 1);
                    // Must be a frame group (`<g id="fN"`) — if not, caller's invariant
                    // is violated and we stop here rather than walking outward.
                    if (!_contains(tagText, 'id="f')) {
                        return false;
                    }
                    return _contains(tagText, needleAttr);
                }
                depth -= 1;
            }
        }
        return false;
    }

    /// @dev Chrome prompt (y=28), top rule (y=82), bottom rule
    ///      (y=372), and footer (y=398) drop `xml:space="preserve"`; only the title
    ///      row at y=56 retains it.
    function _assertNoXmlSpaceOnUntitledChromeRows(string memory svg) internal pure {
        bytes memory svgBytes = bytes(svg);
        bytes memory textOpen = bytes("<text ");
        uint256 cursor = 0;
        while (true) {
            uint256 openAt = _indexOf(svgBytes, textOpen, cursor);
            if (openAt == type(uint256).max) {
                break;
            }
            uint256 closeAt = _indexOf(svgBytes, bytes(">"), openAt);
            require(closeAt != type(uint256).max, "unterminated <text");

            string memory tagText = _slice(svgBytes, openAt, closeAt + 1);
            cursor = closeAt + 1;

            if (!_contains(tagText, 'class="stat"')) {
                continue;
            }
            // The title row lives at y=56 and retains `xml:space="preserve"` for the
            // shiny `<tspan>` trailing-space contract.
            if (_contains(tagText, ' y="56"')) {
                require(
                    _contains(tagText, 'xml:space="preserve"'),
                    "title row must retain xml:space=preserve"
                );
                continue;
            }
            require(
                !_contains(tagText, 'xml:space'),
                "non-title chrome rows must NOT carry xml:space"
            );
        }
    }

    /// @dev Sprite `<text>` nodes must keep `xml:space="preserve"` self-only because
    ///      the target stripper class does not honor a hoisted `xml:space` on the
    ///      `<g id="fN">` wrapper, so leading/trailing sprite whitespace must be
    ///      preserved locally.
    function _assertXmlSpaceOnEverySpriteText(string memory svg) internal pure {
        bytes memory svgBytes = bytes(svg);
        bytes memory textOpen = bytes("<text ");
        uint256 cursor = 0;
        while (true) {
            uint256 openAt = _indexOf(svgBytes, textOpen, cursor);
            if (openAt == type(uint256).max) {
                break;
            }
            uint256 closeAt = _indexOf(svgBytes, bytes(">"), openAt);
            require(closeAt != type(uint256).max, "unterminated <text");

            string memory tagText = _slice(svgBytes, openAt, closeAt + 1);
            cursor = closeAt + 1;

            if (!_contains(tagText, 'class="sprite"')) {
                continue;
            }
            require(
                _contains(tagText, 'xml:space="preserve"'),
                "sprite <text> must carry xml:space=preserve directly"
            );
        }
    }

    /// @dev Walks backward from `anchorOffset` looking for open `<g ` tags whose matching
    ///      `</g>` falls after `anchorOffset` — i.e. groups that enclose `anchorOffset`.
    ///      Returns true if any such group's opening tag contains `needleAttr`. Stops at
    ///      the `<svg` root.
    function _anyAncestorGroupHasAttribute(
        bytes memory svgBytes,
        uint256 anchorOffset,
        string memory needleAttr
    )
        internal
        pure
        returns (bool)
    {
        int256 depth = 0;
        uint256 i = anchorOffset;
        while (i > 0) {
            --i;
            // Look for the start of a `</g>` or `<g ` tag ending at some position <= anchorOffset.
            if (
                i + 3 <= svgBytes.length
                    && svgBytes[i] == ASCII_LT && svgBytes[i + 1] == ASCII_SLASH && svgBytes[i + 2] == ASCII_G
            ) {
                depth += 1;
                continue;
            }
            if (
                i + 3 <= svgBytes.length
                    && svgBytes[i] == ASCII_LT && svgBytes[i + 1] == ASCII_G
                    && (svgBytes[i + 2] == ASCII_SPACE || svgBytes[i + 2] == ASCII_GT)
            ) {
                if (depth == 0) {
                    // Enclosing group. Scan its opening tag up to first `>`.
                    uint256 closeAt = _indexOf(svgBytes, bytes(">"), i);
                    if (closeAt == type(uint256).max || closeAt > anchorOffset) {
                        return false;
                    }
                    string memory tagText = _slice(svgBytes, i, closeAt + 1);
                    if (_contains(tagText, needleAttr)) {
                        return true;
                    }
                    // Otherwise keep walking outward.
                } else {
                    depth -= 1;
                }
            }
        }
        return false;
    }

    // ----- off-chain mirrors of BuddyRenderer derivations -------------------------

    function _expectedBaseHue(bytes32 identityHash, uint8 species) internal pure returns (uint256) {
        uint256 hue = (
            (uint256(uint8(identityHash[0])) << 16)
                | (uint256(uint8(identityHash[1])) << 8)
                | uint256(uint8(identityHash[2]))
        ) % 360;
        return (hue + (uint256(species) * 11)) % 360;
    }

    function _expectedBaseSaturation(uint8 rarity, uint8 species) internal pure returns (uint256) {
        return 42 + (uint256(rarity) * 8) + ((uint256(species) % 4) * 3);
    }

    function _expectedShortArcMidHue(uint256 a, uint256 b) internal pure returns (uint256) {
        uint256 diff = a > b ? a - b : b - a;
        if (diff <= 180) {
            return (a + b) / 2;
        }
        return ((a + b + 360) / 2) % 360;
    }

    function _u2s(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 v = value;
        uint256 digits;
        while (v != 0) { digits++; v /= 10; }
        bytes memory out = new bytes(digits);
        v = value;
        while (v != 0) {
            --digits;
            out[digits] = DECIMAL_DIGITS[v % 10];
            v /= 10;
        }
        return string(out);
    }

    // ----- generic byte utilities -------------------------------------------------

    function _contains(string memory haystack, string memory needle) internal pure returns (bool) {
        return _indexOf(bytes(haystack), bytes(needle), 0) != type(uint256).max;
    }

    function _countOccurrences(string memory haystack, string memory needle) internal pure returns (uint256 count) {
        bytes memory hb = bytes(haystack);
        bytes memory nb = bytes(needle);
        if (nb.length == 0 || nb.length > hb.length) return 0;
        for (uint256 i = 0; i <= hb.length - nb.length; ++i) {
            bool match_ = true;
            for (uint256 j = 0; j < nb.length; ++j) {
                if (hb[i + j] != nb[j]) { match_ = false; break; }
            }
            if (match_) ++count;
        }
    }

    function _indexOf(bytes memory haystack, bytes memory needle, uint256 from)
        internal
        pure
        returns (uint256)
    {
        if (needle.length == 0 || haystack.length < needle.length) {
            return type(uint256).max;
        }
        for (uint256 i = from; i <= haystack.length - needle.length; ++i) {
            bool match_ = true;
            for (uint256 j = 0; j < needle.length; ++j) {
                if (haystack[i + j] != needle[j]) { match_ = false; break; }
            }
            if (match_) return i;
        }
        return type(uint256).max;
    }

    function _slice(bytes memory source, uint256 startIdx, uint256 endIdxExclusive)
        internal
        pure
        returns (string memory)
    {
        bytes memory out = new bytes(endIdxExclusive - startIdx);
        for (uint256 i = 0; i < out.length; ++i) {
            out[i] = source[startIdx + i];
        }
        return string(out);
    }
}
