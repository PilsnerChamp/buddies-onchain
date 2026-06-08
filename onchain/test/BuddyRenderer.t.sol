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

contract BuddyRendererTest is Test {
    using stdJson for string;

    string internal constant JSON_PREFIX = "data:application/json;base64,";
    string internal constant SVG_PREFIX = "data:image/svg+xml;base64,";
    string internal constant DESCRIPTION = "One Claude account. One buddy. Lives on-chain. No host. No takedown.";
    string internal constant TEST_UUID = "123e4567-e89b-42d3-a456-426614174000";
    string internal constant FONT_PATH = "contract-data/fonts/chrome/BuddyFont.woff2";
    string internal constant RULE =
        unicode"───────────────────────────────────────────";
    bytes1 internal constant ASCII_GT = 0x3e;

    BuddySpriteData internal spriteData;
    BuddyFont internal buddyFont;
    BuddySpriteFont internal buddySpriteFont;
    BuddyRenderer internal renderer;
    MockBuddyNFTForRenderer internal mockBuddy;

    function setUp() public {
        spriteData = new BuddySpriteData();
        buddyFont = new BuddyFont(vm.readFileBinary(FONT_PATH));
        buddySpriteFont = new BuddySpriteFont(vm.readFileBinary("contract-data/fonts/sprite/BuddySpriteFont.woff2"));
        renderer = new BuddyRenderer(address(spriteData), address(buddyFont), address(buddySpriteFont));
        mockBuddy = new MockBuddyNFTForRenderer();
    }

    function test_tokenURI_metadataStructureAndSvgPrefixes() public {
        _setMockToken(1, _defaultTraits(), "", uint32(0x1234), IBuddyNFT.OwnershipStage.Custodial);

        string memory tokenUri = renderer.tokenURI(address(mockBuddy), 1);
        assertTrue(_startsWith(tokenUri, JSON_PREFIX));

        string memory json = _decodeJson(tokenUri);
        assertEq(json.readString(".name"), "Buddy Onchain #1");
        assertEq(json.readString(".description"), DESCRIPTION);
        assertTrue(json.keyExists(".attributes"));

        string memory image = json.readString(".image");
        assertTrue(_startsWith(image, SVG_PREFIX));

        string memory svg = _decodeSvg(image);
        assertTrue(_contains(svg, "<svg"));
        assertTrue(_contains(svg, "<text"));
        assertTrue(_contains(svg, 'xml:space="preserve"'));
    }

    function test_tokenURI_emitsRailPromptTitleSpriteAndFooter() public {
        IBuddyNFT.BuddyTraits memory traits = IBuddyNFT.BuddyTraits({
            species: 16,
            rarity: 4,
            eyes: 1,
            hat: 0,
            shiny: true,
            debugging: 100,
            patience: 54,
            chaos: 89,
            wisdom: 88,
            snark: 87
        });

        _setMockToken(1, traits, "", uint32(0xD16A), IBuddyNFT.OwnershipStage.Custodial);

        string memory tokenUri = renderer.tokenURI(address(mockBuddy), 1);
        assertTrue(_startsWith(tokenUri, JSON_PREFIX));

        string memory svg = _decodeSvgFromTokenUri(tokenUri);

        assertTrue(
            _contains(svg, '<text class="stat" x="16" y="28" font-size="18">&gt; /buddy-onchain</text>'),
            "missing prompt"
        );
        assertTrue(
            _contains(
                svg,
                unicode'<text class="stat" x="16" y="56" font-size="18" xml:space="preserve"><tspan fill="#FFC107" font-weight="bold">✦SHINY✦ </tspan>LEGENDARY │ MUSHROOM │ HATCHED</text>'
            ),
            "missing shiny title rail"
        );
        assertEq(_countOccurrences(svg, RULE), 2, "expected top and bottom rules");
        assertTrue(
            _contains(
                svg,
                unicode'<text class="stat" x="16" y="398" font-size="18" textLength="388" lengthAdjust="spacingAndGlyphs">DBG 100 │ PAT 54 │ CHA 89 │ WIS 88 │ SNK 87</text>'
            ),
            "missing footer rail"
        );
        assertTrue(
            _contains(svg, '<text class="sprite" x="21" y="125" xml:space="preserve">                 </text>'),
            "missing reserved row 0 slot"
        );
        assertTrue(
            _contains(svg, '<text class="sprite" x="21" y="175" xml:space="preserve">    .-o-OO-o-.   </text>'),
            "missing first visible sprite row at full-height baseline"
        );
        assertTrue(
            _contains(svg, '<text class="sprite" x="21" y="325" xml:space="preserve">      |____|     </text>'),
            "missing final visible sprite row at full-height baseline"
        );
        assertFalse(_contains(svg, '<rect x="160"'), "unexpected geometric trait bars");
    }

    function test_RowHeights_hatlessDuck_halfHeight() public {
        IBuddyNFT.BuddyTraits memory traits = _defaultTraits();
        traits.species = 0;
        traits.hat = 0;
        _setMockToken(1, traits, "", uint32(0x601), IBuddyNFT.OwnershipStage.Custodial);

        string memory svg = _decodeSvgFromTokenUri(renderer.tokenURI(address(mockBuddy), 1));

        assertTrue(_contains(svg, '<text class="sprite" x="21" y="125"'));
        assertTrue(_contains(svg, '<text class="sprite" x="21" y="150"'));
        assertTrue(_contains(svg, '<text class="sprite" x="21" y="200"'));
        assertTrue(_contains(svg, '<text class="sprite" x="21" y="250"'));
        assertTrue(_contains(svg, '<text class="sprite" x="21" y="300"'));
        assertFalse(_contains(svg, '<text class="sprite" x="21" y="175"'));
        assertFalse(_contains(svg, '<text class="sprite" x="21" y="225"'));
    }

    function test_RowHeights_hattedDuck_fullHeight() public {
        IBuddyNFT.BuddyTraits memory traits = _defaultTraits();
        traits.species = 0;
        traits.hat = 1;
        _setMockToken(1, traits, "", uint32(0x602), IBuddyNFT.OwnershipStage.Custodial);

        string memory svg = _decodeSvgFromTokenUri(renderer.tokenURI(address(mockBuddy), 1));

        assertTrue(_contains(svg, '<text class="sprite" x="21" y="125"'));
        assertTrue(_contains(svg, '<text class="sprite" x="21" y="175"'));
        assertTrue(_contains(svg, '<text class="sprite" x="21" y="225"'));
        assertTrue(_contains(svg, '<text class="sprite" x="21" y="275"'));
        assertTrue(_contains(svg, '<text class="sprite" x="21" y="325"'));
        assertFalse(_contains(svg, '<text class="sprite" x="21" y="150"'));
        assertFalse(_contains(svg, '<text class="sprite" x="21" y="200"'));
    }

    function test_RowHeights_hatlessDragon_fullHeight() public {
        IBuddyNFT.BuddyTraits memory traits = _defaultTraits();
        traits.species = 4;
        traits.hat = 0;
        _setMockToken(1, traits, "", uint32(0x603), IBuddyNFT.OwnershipStage.Custodial);

        string memory svg = _decodeSvgFromTokenUri(renderer.tokenURI(address(mockBuddy), 1));

        assertTrue(_contains(svg, '<text class="sprite" x="21" y="125"'));
        assertTrue(_contains(svg, '<text class="sprite" x="21" y="175"'));
        assertTrue(_contains(svg, '<text class="sprite" x="21" y="225"'));
        assertTrue(_contains(svg, '<text class="sprite" x="21" y="275"'));
        assertTrue(_contains(svg, '<text class="sprite" x="21" y="325"'));
        assertFalse(_contains(svg, '<text class="sprite" x="21" y="150"'));
    }

    function test_RowHeights_hattedDragon_fullHeight() public {
        IBuddyNFT.BuddyTraits memory traits = _defaultTraits();
        traits.species = 4;
        traits.hat = 1;
        _setMockToken(1, traits, "", uint32(0x604), IBuddyNFT.OwnershipStage.Custodial);

        string memory svg = _decodeSvgFromTokenUri(renderer.tokenURI(address(mockBuddy), 1));

        assertTrue(_contains(svg, '<text class="sprite" x="21" y="125"'));
        assertTrue(_contains(svg, '<text class="sprite" x="21" y="175"'));
        assertTrue(_contains(svg, '<text class="sprite" x="21" y="225"'));
        assertTrue(_contains(svg, '<text class="sprite" x="21" y="275"'));
        assertTrue(_contains(svg, '<text class="sprite" x="21" y="325"'));
    }

    function test_tokenURI_escapesAdversarialNamesInJsonAndSvg() public {
        IBuddyNFT.BuddyTraits memory traits = _defaultTraits();
        string memory name = unicode"<>&\"'\\友";
        string memory expectedDisplayName = string.concat(name, unicode" · Buddy Onchain #1");
        _setMockToken(1, traits, name, uint32(0xBEEF), IBuddyNFT.OwnershipStage.Bonded);

        string memory tokenUri = renderer.tokenURI(address(mockBuddy), 1);
        string memory json = _decodeJson(tokenUri);

        assertEq(json.readString(".name"), expectedDisplayName);
        assertTrue(_contains(json, unicode"<>&\\\"'\\\\友 · Buddy Onchain #1"));
        assertTrue(_contains(_decodeSvg(json.readString(".image")), "<title>Buddy #1 - Duck, Uncommon, Bonded</title>"));
    }

    function test_tokenURI_supportsUnicodeNames() public {
        IBuddyNFT.BuddyTraits memory traits = _defaultTraits();
        string memory name = unicode"友達";
        _setMockToken(1, traits, name, uint32(0xCAFE), IBuddyNFT.OwnershipStage.Bonded);

        string memory json = _decodeJson(renderer.tokenURI(address(mockBuddy), 1));

        assertEq(json.readString(".name"), string.concat(name, unicode" · Buddy Onchain #1"));
    }

    function test_tokenURI_stageHandlingForHatchedAndBonded() public {
        IBuddyNFT.BuddyTraits memory traits = _defaultTraits();

        _setMockToken(1, traits, "", uint32(0xA1), IBuddyNFT.OwnershipStage.Custodial);
        string memory custodialJson = _decodeJson(renderer.tokenURI(address(mockBuddy), 1));
        assertEq(custodialJson.readString(".name"), "Buddy Onchain #1");
        assertEq(custodialJson.readString(".attributes[5].value"), "Hatched");

        _setMockToken(1, traits, "Pilsner", uint32(0xA2), IBuddyNFT.OwnershipStage.Bonded);
        string memory bondedJson = _decodeJson(renderer.tokenURI(address(mockBuddy), 1));
        assertEq(bondedJson.readString(".name"), unicode"Pilsner · Buddy Onchain #1");
        assertEq(bondedJson.readString(".attributes[5].value"), "Bonded");
    }

    function test_tokenURI_rootTitleMetadata() public {
        _setMockToken(1, _defaultTraits(), "", uint32(0x4444), IBuddyNFT.OwnershipStage.Custodial);

        string memory svg = _decodeSvgFromTokenUri(renderer.tokenURI(address(mockBuddy), 1));

        assertTrue(
            _contains(
                svg,
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 420"><title>Buddy #1 - Duck, Uncommon, Hatched</title><style>'
            )
        );
    }

    function test_tokenURI_backgroundClippedToViewBoxViaClipPath() public {
        // Circles at cx near the right edge (e.g. cx=384, r=115) plus per-token
        // drift amplitudes (±18/±16/±14 px) already extend past the 420x420
        // viewBox. Root `overflow="hidden"` is insufficient — it clips to the
        // initial viewport, not the viewBox rect. Standalone viewers (Edge/etc.)
        // scale the viewport to the window and render content at user-space
        // x>420 visibly outside the logical square. The fix is an explicit
        // <clipPath id="vp"> wrapping the background group; this clips to the
        // viewBox rectangle in all render contexts (standalone, inline, <img>).
        _setMockToken(1, _defaultTraits(), "", uint32(0x7070), IBuddyNFT.OwnershipStage.Custodial);
        string memory custodialSvg = _decodeSvgFromTokenUri(renderer.tokenURI(address(mockBuddy), 1));
        assertTrue(_contains(custodialSvg, '<clipPath id="vp"><rect width="420" height="420"/></clipPath>'));
        assertTrue(_contains(custodialSvg, '<g clip-path="url(#vp)">'));
        assertEq(_countOccurrences(custodialSvg, '<clipPath id="vp">'), 1);
        assertEq(_countOccurrences(custodialSvg, '<g clip-path="url(#vp)">'), 1);
        // Sanity: the superseded overflow attribute is no longer emitted.
        assertFalse(_contains(custodialSvg, 'overflow="hidden"'));
        // Boundary assertion: the wrapper must close immediately before the first
        // chrome rail text (prompt `> /buddy-onchain` at y=28). If foreground content
        // (sprite frame groups, chrome rails) ever drifts inside the wrapper,
        // this substring stops matching and the test fails.
        assertTrue(
            _contains(custodialSvg, '</g><g font-family="monospace" fill="#cbd5e1"><text class="stat" x="16" y="28"')
        );

        _setMockToken(2, _defaultTraits(), "Pilsner", uint32(0x7171), IBuddyNFT.OwnershipStage.Bonded);
        string memory bondedSvg = _decodeSvgFromTokenUri(renderer.tokenURI(address(mockBuddy), 2));
        assertTrue(_contains(bondedSvg, '<clipPath id="vp"><rect width="420" height="420"/></clipPath>'));
        assertTrue(_contains(bondedSvg, '<g clip-path="url(#vp)">'));
        assertEq(_countOccurrences(bondedSvg, '<clipPath id="vp">'), 1);
        assertEq(_countOccurrences(bondedSvg, '<g clip-path="url(#vp)">'), 1);
        assertFalse(_contains(bondedSvg, 'overflow="hidden"'));
        assertTrue(
            _contains(bondedSvg, '</g><g font-family="monospace" fill="#cbd5e1"><text class="stat" x="16" y="28"')
        );
    }

    function test_tokenURI_titleAndMetadataNameContractForBothStages() public {
        IBuddyNFT.BuddyTraits memory traits = _defaultTraits();

        _setMockToken(1, traits, "", uint32(0x6161), IBuddyNFT.OwnershipStage.Custodial);
        string memory custodialSvg = _decodeSvgFromTokenUri(renderer.tokenURI(address(mockBuddy), 1));

        assertTrue(_contains(custodialSvg, "<title>Buddy #1 - Duck, Uncommon, Hatched</title>"));

        string memory bondedName = "Pilsner";
        _setMockToken(2, traits, bondedName, uint32(0x6262), IBuddyNFT.OwnershipStage.Bonded);
        string memory bondedTokenUri = renderer.tokenURI(address(mockBuddy), 2);
        string memory bondedJson = _decodeJson(bondedTokenUri);
        string memory bondedSvg = _decodeSvg(bondedJson.readString(".image"));

        assertEq(bondedJson.readString(".name"), string.concat(bondedName, unicode" · Buddy Onchain #2"));
        assertTrue(_contains(bondedSvg, "<title>Buddy #2 - Duck, Uncommon, Bonded</title>"));
    }

    function test_tokenURI_emitsEmbeddedFontCssAndDeterministicSpriteRows() public {
        _setMockToken(1, _defaultTraits(), "", uint32(0x5151), IBuddyNFT.OwnershipStage.Custodial);

        string memory svg = _decodeSvgFromTokenUri(renderer.tokenURI(address(mockBuddy), 1));

        assertTrue(_contains(svg, "<style>@font-face{font-family:'BuddyFont'"));
        assertTrue(_contains(svg, ".stat{font-family:'BuddyFont',monospace}"));
        assertTrue(_contains(svg, "@font-face{font-family:'BuddySpriteFont'"));
        assertTrue(_contains(svg, ".sprite{font-family:'BuddySpriteFont',monospace}"));
        assertTrue(_contains(svg, ".sprite{fill:#e2e8f0}"));
        assertTrue(_contains(svg, ".stat{fill:#cbd5e1}"));

        // 4 frame groups (f0, f1, f2, fb) × 5 rows per group = 20 sprite text nodes.
        assertEq(_countOccurrences(svg, '<text class="sprite"'), 20);

        // Default traits have hat=5, so row 0 is not blank: standard 50px gap.
        // `font-size="37"` hoisted onto `<g id="fN">`, so sprite `<text>` opens
        // no longer carry it directly. See `docs/onchain/renderer.md`
        // § Stripping fallbacks.
        string[5] memory expectedBaselines = ["125", "175", "225", "275", "325"];
        for (uint256 i = 0; i < expectedBaselines.length; ++i) {
            assertEq(
                _countOccurrences(
                    svg,
                    string.concat('<text class="sprite" x="21" y="', expectedBaselines[i], '" xml:space="preserve">')
                ),
                4,
                "expected identical y-coordinates across all four sprite frame groups"
            );
        }
    }

    function test_tokenURI_svgKeepsBackgroundShapes() public {
        _setMockToken(1, _defaultTraits(), "", uint32(0x8888), IBuddyNFT.OwnershipStage.Custodial);

        string memory svg = _decodeSvgFromTokenUri(renderer.tokenURI(address(mockBuddy), 1));
        // Rect now carries an SVG paint-fallback (see `docs/onchain/renderer.md`
        // § Background paint fallback): `fill="url(#bg) hsl(..)"`. Rich renderers
        // resolve `url(#bg)`; strippers that kill `<defs>` fall back to the HSL triple.
        assertTrue(_contains(svg, '<rect width="420" height="420" fill="url(#bg) hsl('));
        assertTrue(_contains(svg, '%)"/>'), "rect fill paint-fallback must close with %)");
        assertEq(_countOccurrences(svg, "<circle"), 3);
    }

    function test_tokenURI_emitsFourAnimationFrameGroupsWithCorrectVisibility() public {
        _setMockToken(1, _defaultTraits(), "", uint32(0x7777), IBuddyNFT.OwnershipStage.Custodial);

        string memory svg = _decodeSvgFromTokenUri(renderer.tokenURI(address(mockBuddy), 1));

        // f0 must NOT carry a visibility attribute (default visible per SVG spec).
        // Each sprite `<g>` carries `fill="#e2e8f0"` as the slate-200 override of the
        // outer chrome-tier `<g>` fill AND `font-size="37"` hoisted onto the wrapper.
        // See `docs/onchain/renderer.md` § Stripping fallbacks.
        assertTrue(_contains(svg, '<g id="f0" fill="#e2e8f0" font-size="37">'));
        assertFalse(_contains(svg, '<g id="f0" fill="#e2e8f0" font-size="37" visibility'));

        // f1, f2, fb carry `visibility="hidden"` after the fill + font-size hoist.
        assertTrue(_contains(svg, '<g id="f1" fill="#e2e8f0" font-size="37" visibility="hidden">'));
        assertTrue(_contains(svg, '<g id="f2" fill="#e2e8f0" font-size="37" visibility="hidden">'));
        assertTrue(_contains(svg, '<g id="fb" fill="#e2e8f0" font-size="37" visibility="hidden">'));

        assertEq(_countOccurrences(svg, "<g id=\""), 4);
    }

    function test_tokenURI_emitsAnimationCssInExistingStyleBlock() public {
        _setMockToken(1, _defaultTraits(), "", uint32(0x7778), IBuddyNFT.OwnershipStage.Custodial);

        string memory svg = _decodeSvgFromTokenUri(renderer.tokenURI(address(mockBuddy), 1));

        // Animation CSS must live inside the existing <style> block, not wrapped in a new <defs>-scoped <style>.
        // There is exactly one <style> block in the document.
        assertEq(_countOccurrences(svg, "<style>"), 1);
        assertEq(_countOccurrences(svg, "</style>"), 1);

        // Keyframe rules and animation declarations are present inside the style block.
        assertTrue(_contains(svg, "@keyframes f0"));
        assertTrue(_contains(svg, "@keyframes f1"));
        assertTrue(_contains(svg, "@keyframes f2"));
        assertTrue(_contains(svg, "@keyframes fb"));
        assertTrue(_contains(svg, "#f0 { animation: f0"));
        assertTrue(_contains(svg, "step-start"));

        // Shiny-label CSS rule removed from TEXT_STYLE_CSS. Inline
        // `fill="#FFC107" font-weight="bold"` attributes on the shiny tspan are
        // now the sole source of gold + bold styling.
        assertFalse(_contains(svg, ".shiny-label"), "shiny-label CSS rule must be gone");
    }

    function test_tokenURI_blinkGroupReplacesEyeGlyphWithDash() public {
        IBuddyNFT.BuddyTraits memory traits = _defaultTraits();
        traits.species = 0; // duck
        traits.rarity = 1;
        traits.eyes = 1; // ✦ glyph
        traits.hat = 1; // crown, so row 0 is the hat (not blank) and halfHeightTopSlot is false
        _setMockToken(1, traits, "", uint32(0xB11), IBuddyNFT.OwnershipStage.Custodial);

        string memory svg = _decodeSvgFromTokenUri(renderer.tokenURI(address(mockBuddy), 1));

        // f0 group contains the eye glyph at the expected positions; fb group replaces those positions with `-`.
        // Slice out each frame group and inspect independently.
        string memory f0Group = _extractGroup(svg, "f0");
        string memory fbGroup = _extractGroup(svg, "fb");

        // Duck body has two eye placeholders. f0 must contain the selected eye glyph.
        assertTrue(_contains(f0Group, unicode"✦"));
        // fb must NOT contain the eye glyph (replaced by `-`).
        assertFalse(_contains(fbGroup, unicode"✦"));
        // fb must contain `-` at sprite-body content positions.
        assertTrue(_contains(fbGroup, "-"));

        string memory f0EyeRow =
            unicode'<text class="sprite" x="21" y="225" xml:space="preserve">     &lt;(✦ )___    </text>';
        string memory fbBlinkRow =
            unicode'<text class="sprite" x="21" y="225" xml:space="preserve">     &lt;(- )___    </text>';

        assertTrue(_contains(f0Group, f0EyeRow), "f0 must contain the duck eye row with the selected glyph");
        assertTrue(_contains(fbGroup, fbBlinkRow), "fb must contain the same row with eye glyph replaced by dash");
        assertFalse(_contains(f0Group, fbBlinkRow), "f0 must not contain the blink-substituted row literal");
    }

    function test_tokenURI_frameGroupsShareIdenticalYCoordinates() public {
        // Use a row-0-using species (mushroom) with no hat so halfHeightTopSlot=false → full 5-row baselines.
        IBuddyNFT.BuddyTraits memory traits = _defaultTraits();
        traits.species = 16;
        traits.hat = 0;
        _setMockToken(1, traits, "", uint32(0xA11A), IBuddyNFT.OwnershipStage.Custodial);

        string memory svg = _decodeSvgFromTokenUri(renderer.tokenURI(address(mockBuddy), 1));

        // Every sprite row baseline appears in all four frame groups.
        string[5] memory expectedBaselines = ["125", "175", "225", "275", "325"];
        for (uint256 i = 0; i < expectedBaselines.length; ++i) {
            assertEq(
                _countOccurrences(svg, string.concat('<text class="sprite" x="21" y="', expectedBaselines[i], '"')),
                4,
                "expected each y-coordinate in all four frame groups"
            );
        }
    }

    function test_tokenURI_frameGroupsShareCompressedTopBaselinesWhenHatless() public {
        IBuddyNFT.BuddyTraits memory traits = _defaultTraits();
        traits.species = 0; // duck → four-row-eligible species
        traits.hat = 0; // halfHeightTopSlot=true
        _setMockToken(1, traits, "", uint32(0x9A15), IBuddyNFT.OwnershipStage.Custodial);

        string memory svg = _decodeSvgFromTokenUri(renderer.tokenURI(address(mockBuddy), 1));
        string[5] memory expectedBaselines = ["125", "150", "200", "250", "300"];

        for (uint256 i = 0; i < expectedBaselines.length; ++i) {
            assertEq(
                _countOccurrences(svg, string.concat('<text class="sprite" x="21" y="', expectedBaselines[i], '"')),
                4,
                "expected each compressed-top y-coordinate in all four frame groups"
            );
        }
    }

    function test_tokenURI_frameGroupsEmitDistinctFrameContentForNonRow0Species() public {
        IBuddyNFT.BuddyTraits memory traits = _defaultTraits();
        traits.species = 0; // duck
        traits.hat = 1; // keep row 0 occupied by crown; compare body row deltas lower in the sprite
        traits.eyes = 0; // default eye glyph to avoid blink-specific coupling
        _setMockToken(1, traits, "", uint32(0xD1F1), IBuddyNFT.OwnershipStage.Custodial);

        string memory svg = _decodeSvgFromTokenUri(renderer.tokenURI(address(mockBuddy), 1));
        string memory f0Group = _extractGroup(svg, "f0");
        string memory f1Group = _extractGroup(svg, "f1");

        string memory frame0TailRow =
            unicode'<text class="sprite" x="21" y="325" xml:space="preserve">       `--´     </text>';
        string memory frame1TailRow =
            unicode'<text class="sprite" x="21" y="325" xml:space="preserve">       `--´~    </text>';

        assertTrue(_contains(f0Group, frame0TailRow), "f0 must contain the duck frame-0 tail row");
        assertFalse(_contains(f0Group, frame1TailRow), "f0 must not collapse to the frame-1 tail row");
        assertTrue(_contains(f1Group, frame1TailRow), "f1 must contain the duck frame-1 tail row");
        assertFalse(_contains(f1Group, frame0TailRow), "f1 must not collapse back to the frame-0 tail row");
    }

    function test_tokenURI_frame2HatFlickerForRow0UsingSpecies() public {
        // Canonical hat flicker: for a row-0-using species (mushroom) with a hat, frame 2's
        // row-0 body content must override the hat. Frame 0 and 1 show the hat at row 0.
        IBuddyNFT.BuddyTraits memory traits = _defaultTraits();
        traits.species = 16; // mushroom
        traits.hat = 1; // crown
        _setMockToken(1, traits, "", uint32(0xF71A), IBuddyNFT.OwnershipStage.Custodial);

        string memory svg = _decodeSvgFromTokenUri(renderer.tokenURI(address(mockBuddy), 1));

        string memory f0Group = _extractGroup(svg, "f0");
        string memory f1Group = _extractGroup(svg, "f1");
        string memory f2Group = _extractGroup(svg, "f2");

        // Mushroom frame 2 row 0 spore content (leading/trailing spaces preserved verbatim).
        string memory spore = unicode"      . o  .     ";

        // The spore content must NOT appear in frame 0 or 1 (their row 0 is blank so the hat wins).
        assertFalse(_contains(f0Group, spore), "frame 0 must not contain the mushroom spore");
        assertFalse(_contains(f1Group, spore), "frame 1 must not contain the mushroom spore");
        // Frame 2 must contain the spore content at row 0, replacing the crown hat.
        assertTrue(_contains(f2Group, spore), "frame 2 must contain the mushroom spore at row 0");
    }

    function test_tokenURI_nonShinyTitleOmitsShinyLabelTspan() public {
        IBuddyNFT.BuddyTraits memory traits = _defaultTraits();
        traits.shiny = false;
        _setMockToken(1, traits, "", uint32(0xA455), IBuddyNFT.OwnershipStage.Custodial);

        string memory svg = _decodeSvgFromTokenUri(renderer.tokenURI(address(mockBuddy), 1));

        assertFalse(_contains(svg, '<tspan class="shiny-label"'), "non-shiny must not emit shiny-label tspan");
        assertFalse(_contains(svg, unicode"✦SHINY✦"), "non-shiny must not emit shiny prefix");
        // Title still renders as a single <text class="stat"> without tspan wrapping.
        assertTrue(
            _contains(
                svg,
                unicode'<text class="stat" x="16" y="56" font-size="18" xml:space="preserve">UNCOMMON │ DUCK │ HATCHED</text>'
            )
        );
    }

    function test_tokenURI_shinyOverlayIsDisabledInSpriteOnlyMode() public {
        IBuddyNFT.BuddyTraits memory traits = _defaultTraits();

        traits.shiny = false;
        _setMockToken(1, traits, "", uint32(0x501), IBuddyNFT.OwnershipStage.Custodial);
        assertFalse(_contains(_decodeSvgFromTokenUri(renderer.tokenURI(address(mockBuddy), 1)), "url(#shine)"));

        traits.shiny = true;
        _setMockToken(1, traits, "", uint32(0x502), IBuddyNFT.OwnershipStage.Custodial);
        assertFalse(_contains(_decodeSvgFromTokenUri(renderer.tokenURI(address(mockBuddy), 1)), "url(#shine)"));
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
        uint32 prngSeed,
        IBuddyNFT.OwnershipStage stage
    ) internal {
        mockBuddy.setTraits(tokenId, traits);
        mockBuddy.setName(tokenId, name);
        mockBuddy.setIdentityHash(tokenId, keccak256(abi.encodePacked("renderer-test-identity", tokenId)));
        mockBuddy.setPrngSeed(tokenId, prngSeed);
        mockBuddy.setStage(tokenId, stage);
    }

    function _decodeJson(string memory tokenUri) internal pure returns (string memory) {
        return string(Base64.decode(_afterPrefix(tokenUri, JSON_PREFIX)));
    }

    function _decodeSvgFromTokenUri(string memory tokenUri) internal pure returns (string memory) {
        return _decodeSvg(_decodeJson(tokenUri).readString(".image"));
    }

    function _decodeSvg(string memory imageUri) internal pure returns (string memory) {
        return string(Base64.decode(_afterPrefix(imageUri, SVG_PREFIX)));
    }

    function _afterPrefix(string memory value, string memory prefix) internal pure returns (string memory) {
        bytes memory valueBytes = bytes(value);
        bytes memory prefixBytes = bytes(prefix);

        if (!_startsWith(value, prefix)) {
            revert("missing prefix");
        }

        bytes memory tail = new bytes(valueBytes.length - prefixBytes.length);
        for (uint256 i = 0; i < tail.length; ++i) {
            tail[i] = valueBytes[i + prefixBytes.length];
        }
        return string(tail);
    }

    function _startsWith(string memory value, string memory prefix) internal pure returns (bool) {
        bytes memory valueBytes = bytes(value);
        bytes memory prefixBytes = bytes(prefix);

        if (prefixBytes.length > valueBytes.length) {
            return false;
        }

        for (uint256 i = 0; i < prefixBytes.length; ++i) {
            if (valueBytes[i] != prefixBytes[i]) {
                return false;
            }
        }

        return true;
    }

    function _contains(string memory haystack, string memory needle) internal pure returns (bool) {
        bytes memory haystackBytes = bytes(haystack);
        bytes memory needleBytes = bytes(needle);

        if (needleBytes.length == 0) {
            return true;
        }
        if (needleBytes.length > haystackBytes.length) {
            return false;
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
                return true;
            }
        }

        return false;
    }

    function _extractGroup(string memory svg, string memory groupId) internal pure returns (string memory) {
        bytes memory svgBytes = bytes(svg);
        bytes memory openMarker = bytes(string.concat('<g id="', groupId, '"'));
        uint256 start = _indexOf(svgBytes, openMarker, 0);
        require(start != type(uint256).max, "group open not found");

        // Scan forward to the closing `>` of the opening tag.
        uint256 tagClose = start + openMarker.length;
        while (tagClose < svgBytes.length && svgBytes[tagClose] != ASCII_GT) {
            ++tagClose;
        }
        require(tagClose < svgBytes.length, "group open tag not closed");
        uint256 contentStart = tagClose + 1;

        // Locate the matching </g> for this group (groups are flat in BuddyRenderer output).
        bytes memory closeMarker = bytes("</g>");
        uint256 contentEnd = _indexOf(svgBytes, closeMarker, contentStart);
        require(contentEnd != type(uint256).max, "group close not found");

        bytes memory slice = new bytes(contentEnd - contentStart);
        for (uint256 i = 0; i < slice.length; ++i) {
            slice[i] = svgBytes[contentStart + i];
        }
        return string(slice);
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
}
