// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

import {IBuddyNFT} from "./interfaces/IBuddyNFT.sol";
import {IBuddyRenderer} from "./interfaces/IBuddyRenderer.sol";
import {BuddySpriteData} from "./BuddySpriteData.sol";
import {BuddySpriteFontMetrics} from "./libraries/BuddySpriteFontMetrics.sol";
import {BuddyDomain} from "./libraries/BuddyDomain.sol";

interface IBuddyFont {
    function fontCss() external view returns (string memory);
}

/// @title BuddyRenderer
/// @notice On-chain SVG renderer for Buddies Onchain.
contract BuddyRenderer is IBuddyRenderer {
    using Strings for uint256;

    error ZeroAddress();

    // Lower-camel public immutables are intentional: Solidity exposes these names
    // as external getter functions, and `spriteData()` / `font()` / `spriteFont()`
    // are the human ABI. Internal constants remain SCREAMING_SNAKE_CASE.
    // forge-lint: disable-next-line(screaming-snake-case-immutable)
    BuddySpriteData public immutable spriteData;
    // forge-lint: disable-next-line(screaming-snake-case-immutable)
    address public immutable font;
    // forge-lint: disable-next-line(screaming-snake-case-immutable)
    address public immutable spriteFont;

    string private constant DESCRIPTION = "One account. One buddy. Lives on-chain. No host. No takedown.";

    uint256 private constant CHROME_FONT_SIZE = 18;
    uint256 private constant CHROME_ROW_X = 16;
    uint256 private constant PROMPT_BASELINE = 28;
    uint256 private constant TITLE_BASELINE = 56;
    uint256 private constant TOP_RULE_BASELINE = 82;
    uint256 private constant BOTTOM_RULE_BASELINE = 372;
    uint256 private constant FOOTER_BASELINE = 398;
    uint256 private constant SPRITE_FONT_SIZE = 37;
    uint256 private constant CARD_WIDTH = 420;
    uint256 private constant SPRITE_ROW_X =
        (CARD_WIDTH
            - (uint256(BuddyDomain.BODY_ROW_WIDTH) * BuddySpriteFontMetrics.ADVANCE * SPRITE_FONT_SIZE
                / BuddySpriteFontMetrics.UPEM)) / 2;
    uint256 private constant SPRITE_ROW_0_BASELINE = 125;
    uint256 private constant SPRITE_ROW_GAP = 50;
    uint256 private constant HATLESS_TOP_SLOT_GAP = SPRITE_ROW_GAP / 2;

    string private constant PROMPT = "> /buddy-onchain";
    string private constant RULE = unicode"───────────────────────────────────────────";
    string private constant SHINY_PREFIX = unicode"✦SHINY✦ ";
    string private constant TITLE_SEPARATOR = unicode" │ ";
    string private constant FOOTER_SEPARATOR = unicode" │ ";

    string private constant TEXT_STYLE_CSS = ".sprite{fill:#e2e8f0}.stat{fill:#cbd5e1}";
    uint256 internal constant TICK_MS = 500;
    bytes internal constant IDLE_SEQUENCE = hex"0000000001000000FF000002000000";
    bytes private constant DECIMAL_DIGITS = "0123456789";

    /// @dev 11 coprime primes outside sprite-harmonic bands (29-71 s). Slow pool only;
    /// no fast-pool primes appear anywhere in this contract's source. Each byte holds
    /// one prime < 128 in ascending order:
    ///   29=0x1D, 31=0x1F, 37=0x25, 41=0x29, 43=0x2B, 47=0x2F,
    ///   53=0x35, 59=0x3B, 61=0x3D, 67=0x43, 71=0x47
    bytes internal constant DRIFT_PRIMES = hex"1D1F25292B2F353B3D4347";

    /// @dev Three closed-loop waypoint shapes documented by `onchain/contract-data/sprites/sprite-geometry.md`. Static across
    /// all tokens. Amplitudes =< 18px keep edge circles on-canvas.
    string private constant DRIFT_KEYFRAMES =
        "@keyframes drift0{"
            "0%{transform:translate(0px,0px)}"
            "25%{transform:translate(18px,-8px)}"
            "50%{transform:translate(14px,16px)}"
            "75%{transform:translate(-6px,12px)}"
            "100%{transform:translate(0px,0px)}"
        "}"
        "@keyframes drift1{"
            "0%{transform:translate(0px,0px)}"
            "20%{transform:translate(-14px,-10px)}"
            "40%{transform:translate(12px,-14px)}"
            "60%{transform:translate(-10px,10px)}"
            "80%{transform:translate(14px,8px)}"
            "100%{transform:translate(0px,0px)}"
        "}"
        "@keyframes drift2{"
            "0%{transform:translate(0px,0px)}"
            "33%{transform:translate(10px,-14px)}"
            "66%{transform:translate(-12px,-8px)}"
            "100%{transform:translate(0px,0px)}"
        "}";

    constructor(address spriteData_, address font_, address spriteFont_) {
        if (spriteData_ == address(0) || font_ == address(0) || spriteFont_ == address(0)) {
            revert ZeroAddress();
        }

        spriteData = BuddySpriteData(spriteData_);
        font = font_;
        spriteFont = spriteFont_;
    }

    function _animationCss() internal pure returns (string memory) {
        uint256 cycleMs = TICK_MS * IDLE_SEQUENCE.length;

        return string.concat(
            _animationKeyframes("f0", hex"00"),
            _animationKeyframes("f1", hex"01"),
            _animationKeyframes("f2", hex"02"),
            _animationKeyframes("fb", hex"ff"),
            _animationRule("f0", cycleMs),
            _animationRule("f1", cycleMs),
            _animationRule("f2", cycleMs),
            _animationRule("fb", cycleMs)
        );
    }

    function _formatBp(uint256 bp) private pure returns (string memory) {
        uint256 integerPortion = bp / 100;
        uint256 decimalPortion = bp % 100;

        return string.concat(
            integerPortion.toString(),
            ".",
            (decimalPortion / 10).toString(),
            (decimalPortion % 10).toString(),
            "%"
        );
    }

    function _animationKeyframes(string memory name, bytes1 frameValue) private pure returns (string memory) {
        bytes memory sequence = IDLE_SEQUENCE;
        string memory body;
        bool visible = sequence[0] == frameValue;
        uint256 runStart = 0;

        for (uint256 i = 1; i < sequence.length; ++i) {
            bool nextVisible = sequence[i] == frameValue;
            if (nextVisible == visible) {
                continue;
            }

            body = string.concat(body, _animationVisibilityRange(runStart, i - 1, visible, sequence.length));
            runStart = i;
            visible = nextVisible;
        }

        body = string.concat(
            body,
            _animationVisibilityRange(runStart, sequence.length - 1, visible, sequence.length)
        );

        return string.concat("@keyframes ", name, "{", body, "}");
    }

    function _animationVisibilityRange(
        uint256 startTick,
        uint256 endTick,
        bool visible,
        uint256 sequenceLength
    )
        private
        pure
        returns (string memory)
    {
        uint256 startBp = (startTick * 10000) / sequenceLength;
        uint256 endBp = (((endTick + 1) * 10000) / sequenceLength) - 1;

        return string.concat(
            _formatBp(startBp),
            ", ",
            _formatBp(endBp),
            " { visibility: ",
            visible ? "visible" : "hidden",
            "; }"
        );
    }

    function _animationRule(string memory name, uint256 cycleMs) private pure returns (string memory) {
        return string.concat(
            "#",
            name,
            " { animation: ",
            name,
            " ",
            cycleMs.toString(),
            "ms infinite step-start; }"
        );
    }

    function tokenURI(address buddyNft, uint256 tokenId) external view override returns (string memory) {
        IBuddyNFT buddy = IBuddyNFT(buddyNft);
        IBuddyNFT.BuddyTraits memory traits = buddy.buddyTraits(tokenId);
        string memory buddyName = buddy.buddyName(tokenId);
        uint32 seed = buddy.buddyPrngSeed(tokenId);
        IBuddyNFT.OwnershipStage stage = buddy.getStage(tokenId);
        // Provider pulled via the IBuddyNFT view like all other token data; the
        // value is JSON metadata only (v1 art ignores it). Reading on demand
        // keeps the IBuddyRenderer signature stable and lets a future renderer
        // branch art per provider without a BuddyNFT redeploy.
        string memory provider = _trimProvider(buddy.buddyProvider(tokenId));

        string memory svg =
            _buildSvg(_svgMetadataTitle(tokenId, traits, stage), keccak256(abi.encode(seed)), traits, stage);
        string memory image = string(
            abi.encodePacked("data:image/svg+xml;base64,", Base64.encode(bytes(svg)))
        );
        string memory metadata =
            _buildMetadata(_metadataDisplayName(buddyName, tokenId), image, traits, stage, tokenId, provider);

        return string(
            abi.encodePacked("data:application/json;base64,", Base64.encode(bytes(metadata)))
        );
    }

    function _buildSvg(
        string memory metadataTitle,
        bytes32 backdropHash,
        IBuddyNFT.BuddyTraits memory traits,
        IBuddyNFT.OwnershipStage stage
    )
        internal
        view
        returns (string memory)
    {
        // Hoist font-family + chrome fill onto a single `<g>` wrapper. Survives `<style>`
        // stripping (see `docs/onchain/renderer.md` § Stripping fallbacks: two-tier text
        // fill); in rich renders the CSS cascade on `.stat` / `.sprite` overrides these
        // presentation attributes. Sprite `<g id="fN">` groups override `fill` to the
        // slate-200 tier inside `_spriteGroup`.
        return string(
            abi.encodePacked(
                _svgOpen(metadataTitle, backdropHash, traits),
                '<g font-family="monospace" fill="#cbd5e1">',
                _railText(PROMPT, PROMPT_BASELINE, false),
                _titleText(traits, stage),
                _railText(RULE, TOP_RULE_BASELINE, true),
                _spriteSurface(traits),
                _railText(RULE, BOTTOM_RULE_BASELINE, true),
                _railText(_footerLine(traits), FOOTER_BASELINE, true),
                "</g></svg>"
            )
        );
    }

    function _buildMetadata(
        string memory displayName,
        string memory image,
        IBuddyNFT.BuddyTraits memory traits,
        IBuddyNFT.OwnershipStage stage,
        uint256 tokenId,
        string memory provider
    )
        internal
        pure
        returns (string memory)
    {
        return string(
            abi.encodePacked(
                '{"name":"',
                _jsonEscape(displayName),
                '","description":"',
                DESCRIPTION,
                '","image":"',
                image,
                '","attributes":',
                _buildAttributes(traits, stage, provider),
                ',"external_url":"',
                BuddyDomain.SITE_ORIGIN,
                "/view/",
                tokenId.toString(),
                '"',
                "}"
            )
        );
    }

    function _buildAttributes(IBuddyNFT.BuddyTraits memory traits, IBuddyNFT.OwnershipStage stage, string memory provider)
        internal
        pure
        returns (string memory)
    {
        return string(
            abi.encodePacked(
                "[",
                _traitAttributes(traits, stage),
                ",",
                _stringAttribute("Provider", _jsonEscape(provider)),
                ",",
                _statAttributes(traits),
                "]"
            )
        );
    }

    function _svgOpen(string memory metadataTitle, bytes32 backdropHash, IBuddyNFT.BuddyTraits memory traits)
        internal
        view
        returns (string memory)
    {
        return string(
            abi.encodePacked(
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 420"><title>',
                _xmlEscape(metadataTitle),
                "</title><style>",
                _fontCss(),
                TEXT_STYLE_CSS,
                _animationCss(),
                DRIFT_KEYFRAMES,
                _driftRulesCss(backdropHash),
                "</style>",
                _backgroundDefs(backdropHash, traits),
                _backgroundShapes(backdropHash, traits)
            )
        );
    }

    function _spriteSurface(IBuddyNFT.BuddyTraits memory traits) internal view returns (string memory) {
        bool halfHeightTopSlot = (traits.hat == 0) && !spriteData.bodyUsesRow0(traits.species);
        return string(
            abi.encodePacked(
                _spriteGroup(traits, halfHeightTopSlot, 0, false, "f0", false),
                _spriteGroup(traits, halfHeightTopSlot, 1, false, "f1", true),
                _spriteGroup(traits, halfHeightTopSlot, 2, false, "f2", true),
                _spriteGroup(traits, halfHeightTopSlot, 0, true, "fb", true)
            )
        );
    }

    function _spriteGroup(
        IBuddyNFT.BuddyTraits memory traits,
        bool halfHeightTopSlot,
        uint8 frameIdx,
        bool isBlink,
        string memory groupId,
        bool hidden
    )
        internal
        view
        returns (string memory)
    {
        string memory rows;
        for (uint8 row = 0; row < BuddyDomain.SPRITE_ROW_COUNT; ++row) {
            rows = string.concat(
                rows,
                _spriteRowText(_renderSpriteRow(traits, frameIdx, isBlink, row), row, halfHeightTopSlot)
            );
        }
        // `fill="#e2e8f0"` overrides the outer `<g>`'s chrome fill hoisted from
        // `_buildSvg` so sprite rows render in the slate-200 tier under `<style>`
        // stripping (see `docs/onchain/renderer.md` § Stripping fallbacks).
        // `font-size="37"` hoisted onto the frame group — SVG presentation
        // attribute inherits through `<g>`, sparing per-text repetition.
        string memory visibilityAttr = hidden ? ' visibility="hidden"' : "";
        return string(
            abi.encodePacked(
                '<g id="', groupId, '" fill="#e2e8f0" font-size="37"', visibilityAttr, ">",
                rows,
                "</g>"
            )
        );
    }

    /// @dev Opens a `<text class="stat">` tag. `font-family` and `fill` are hoisted onto
    /// the wrapping `<g>` emitted by `_buildSvg` so they survive `<style>` stripping
    /// without per-text repetition (see `docs/onchain/renderer.md` § Stripping
    /// fallbacks). Emits `textLength="388"` + `lengthAdjust="spacingAndGlyphs"` only
    /// when `pinned` is true — the three full-width chrome lines (top rule y=82,
    /// bottom rule y=372, footer stats y=398); the prompt and title lines pass false
    /// so they keep their natural widths (see `docs/onchain/renderer.md`
    /// § `textLength` pinning).
    ///
    /// `preserveWhitespace` emits `xml:space="preserve"`: dropped from prompt /
    /// rules / footer since those lines have no leading/trailing whitespace,
    /// retained only on the title row (y=56) where the shiny branch's
    /// `<tspan>✦SHINY✦ </tspan>` requires the trailing space to separate the marker
    /// from the rarity label. In practice only three call-site shapes exist —
    /// unpinned + no-xml-space (prompt, non-shiny title uses the whitespace form),
    /// pinned + no-xml-space (rules, footer), unpinned + preserve-whitespace (title) —
    /// so the two flags are composed from independent suffix fragments.
    function _chromeTextOpen(uint256 y, bool pinned, bool preserveWhitespace)
        private
        pure
        returns (string memory)
    {
        return string.concat(
            '<text class="stat" x="',
            CHROME_ROW_X.toString(),
            '" y="',
            y.toString(),
            '" font-size="',
            CHROME_FONT_SIZE.toString(),
            '"',
            pinned ? ' textLength="388" lengthAdjust="spacingAndGlyphs"' : "",
            preserveWhitespace ? ' xml:space="preserve"' : "",
            ">"
        );
    }

    function _railText(string memory content, uint256 y, bool pinned) internal pure returns (string memory) {
        return string.concat(_chromeTextOpen(y, pinned, false), _xmlEscape(content), "</text>");
    }

    function _spriteRowText(string memory row, uint256 rowIndex, bool halfHeightTopSlot)
        internal
        pure
        returns (string memory)
    {
        // `font-family` hoisted onto the outer `<g>` in `_buildSvg`; `fill="#e2e8f0"`
        // and `font-size="37"` hoisted onto the per-frame `<g id="fN">` wrapper in
        // `_spriteGroup` (see `docs/onchain/renderer.md` § Stripping fallbacks).
        // `xml:space="preserve"` stays per-text: a target-stripper non-compliance
        // means a hoisted `xml:space` is not inherited onto child text, so sprite
        // leading whitespace must be preserved locally.
        return string(
            abi.encodePacked(
                '<text class="sprite" x="',
                SPRITE_ROW_X.toString(),
                '" y="',
                _spriteRowBaseline(rowIndex, halfHeightTopSlot).toString(),
                '" xml:space="preserve">',
                row,
                "</text>"
            )
        );
    }

    function _spriteRowBaseline(uint256 rowIndex, bool halfHeightTopSlot) internal pure returns (uint256) {
        assert(rowIndex < BuddyDomain.SPRITE_ROW_COUNT);
        if (halfHeightTopSlot && rowIndex > 0) {
            return SPRITE_ROW_0_BASELINE + HATLESS_TOP_SLOT_GAP + ((rowIndex - 1) * SPRITE_ROW_GAP);
        }
        return SPRITE_ROW_0_BASELINE + (rowIndex * SPRITE_ROW_GAP);
    }

    function _titleText(IBuddyNFT.BuddyTraits memory traits, IBuddyNFT.OwnershipStage stage)
        internal
        pure
        returns (string memory)
    {
        string memory body = _xmlEscape(
            string.concat(
                _upper(_rarityLabel(traits.rarity)),
                TITLE_SEPARATOR,
                _upper(_speciesLabel(traits.species)),
                TITLE_SEPARATOR,
                _upper(_stageLabel(stage))
            )
        );

        // Shiny tspan drops `class="shiny-label"`; inline `fill` + `font-weight`
        // attrs are the sole remaining source of gold + bold styling, identical
        // in rich and stripped renders (see `docs/onchain/renderer.md` § Shiny
        // label). The title row preserves whitespace: the trailing space inside
        // `SHINY_PREFIX` is structurally required to separate the marker from the
        // trait body and would collapse under SVG default whitespace handling.
        string memory inner = traits.shiny
            ? string.concat(
                '<tspan fill="#FFC107" font-weight="bold">',
                _xmlEscape(SHINY_PREFIX),
                "</tspan>",
                body
            )
            : body;

        return string.concat(_chromeTextOpen(TITLE_BASELINE, false, true), inner, "</text>");
    }

    function _footerLine(IBuddyNFT.BuddyTraits memory traits) internal pure returns (string memory) {
        return string.concat(
            "DBG ",
            uint256(traits.debugging).toString(),
            FOOTER_SEPARATOR,
            "PAT ",
            uint256(traits.patience).toString(),
            FOOTER_SEPARATOR,
            "CHA ",
            uint256(traits.chaos).toString(),
            FOOTER_SEPARATOR,
            "WIS ",
            uint256(traits.wisdom).toString(),
            FOOTER_SEPARATOR,
            "SNK ",
            uint256(traits.snark).toString()
        );
    }

    function _upper(string memory value) internal pure returns (string memory) {
        bytes memory input = bytes(value);
        bytes memory output = new bytes(input.length);

        for (uint256 i = 0; i < input.length; ++i) {
            bytes1 char = input[i];
            if (char >= BuddyDomain.ASCII_LOWER_A && char <= BuddyDomain.ASCII_LOWER_Z) {
                output[i] = char & BuddyDomain.ASCII_UPPERCASE_MASK;
            } else {
                output[i] = char;
            }
        }

        return string(output);
    }

    function _traitAttributes(IBuddyNFT.BuddyTraits memory traits, IBuddyNFT.OwnershipStage stage)
        internal
        pure
        returns (string memory)
    {
        return string(
            abi.encodePacked(
                _stringAttribute("Species", _speciesLabel(traits.species)),
                ",",
                _stringAttribute("Rarity", _rarityLabel(traits.rarity)),
                ",",
                _stringAttribute("Eyes", _eyeLabel(traits.eyes)),
                ",",
                _stringAttribute("Hat", _hatLabel(traits.hat)),
                ",",
                _stringAttribute("Shiny", traits.shiny ? "Yes" : "No"),
                ",",
                _stringAttribute("Stage", _stageLabel(stage))
            )
        );
    }

    function _statAttributes(IBuddyNFT.BuddyTraits memory traits) internal pure returns (string memory) {
        return string(
            abi.encodePacked(
                _numberAttribute("Debugging", traits.debugging),
                ",",
                _numberAttribute("Patience", traits.patience),
                ",",
                _numberAttribute("Chaos", traits.chaos),
                ",",
                _numberAttribute("Wisdom", traits.wisdom),
                ",",
                _numberAttribute("Snark", traits.snark)
            )
        );
    }

    function _stringAttribute(string memory traitType, string memory value) internal pure returns (string memory) {
        return string(
            abi.encodePacked(
                '{"trait_type":"',
                traitType,
                '","value":"',
                value,
                '"}'
            )
        );
    }

    function _numberAttribute(string memory traitType, uint256 value) internal pure returns (string memory) {
        return string(
            abi.encodePacked(
                '{"display_type":"number","trait_type":"',
                traitType,
                '","value":',
                value.toString(),
                ',"max_value":100}'
            )
        );
    }

    function _metadataDisplayName(string memory buddyName, uint256 tokenId) internal pure returns (string memory) {
        string memory tokenLabel = string.concat("Buddy Onchain #", tokenId.toString());
        if (bytes(buddyName).length == 0) {
            return tokenLabel;
        }

        return string.concat(buddyName, unicode" · ", tokenLabel);
    }

    function _svgMetadataTitle(
        uint256 tokenId,
        IBuddyNFT.BuddyTraits memory traits,
        IBuddyNFT.OwnershipStage stage
    )
        internal
        pure
        returns (string memory)
    {
        return string.concat(
            "Buddy #",
            tokenId.toString(),
            " - ",
            _speciesLabel(traits.species),
            ", ",
            _rarityLabel(traits.rarity),
            ", ",
            _stageLabel(stage)
        );
    }

    function _renderSpriteRow(IBuddyNFT.BuddyTraits memory traits, uint8 frameIdx, bool isBlink, uint8 row)
        internal
        view
        returns (string memory)
    {
        string memory rawRow = spriteData.getBodyRow(traits.species, frameIdx, row);

        if (row == 0 && traits.hat != 0 && _isBlankRow(rawRow)) {
            rawRow = string.concat("  ", spriteData.getHatRow(traits.hat), "  ");
        }

        string memory eyeGlyph = isBlink ? "-" : _eyeGlyph(traits.eyes);
        return _xmlEscape(_replaceEyes(rawRow, eyeGlyph));
    }

    function _replaceEyes(string memory row, string memory eyeGlyph) internal pure returns (string memory) {
        bytes memory source = bytes(row);
        bytes memory glyph = bytes(eyeGlyph);
        uint256 eyeCount;
        for (uint256 i = 0; i < source.length; ++i) {
            if (source[i] == BuddyDomain.ASCII_DIGIT_0) {
                ++eyeCount;
            }
        }

        uint256 outputLength = source.length + (eyeCount * (glyph.length - 1));
        bytes memory replaced = new bytes(outputLength);
        uint256 writeIndex;

        for (uint256 i = 0; i < source.length; ++i) {
            if (source[i] == BuddyDomain.ASCII_DIGIT_0) {
                for (uint256 j = 0; j < glyph.length; ++j) {
                    replaced[writeIndex++] = glyph[j];
                }
                continue;
            }

            replaced[writeIndex++] = source[i];
        }

        assembly {
            mstore(replaced, writeIndex)
        }

        return string(replaced);
    }

    function _isBlankRow(string memory row) internal pure returns (bool) {
        bytes memory rowBytes = bytes(row);
        for (uint256 i = 0; i < rowBytes.length; ++i) {
            if (rowBytes[i] != BuddyDomain.ASCII_SPACE) {
                return false;
            }
        }
        return true;
    }

    function _fontCss() internal view returns (string memory) {
        return string.concat(IBuddyFont(font).fontCss(), IBuddyFont(spriteFont).fontCss());
    }

    function _backgroundDefs(bytes32 backdropHash, IBuddyNFT.BuddyTraits memory traits)
        internal
        pure
        returns (string memory)
    {
        // Gradient stops self-close; `_gradientVector` may return an empty string
        // (preset 2 emits the default horizontal vector), so the separator space between `id="bg"` and
        // the vector is emitted only when the vector is non-empty — avoids the stale
        // trailing-space form `<linearGradient id="bg" >`.
        string memory vector = _gradientVector(backdropHash);
        string memory separator = bytes(vector).length == 0 ? "" : " ";
        return string(
            abi.encodePacked(
                '<defs><clipPath id="vp"><rect width="420" height="420"/></clipPath><linearGradient id="bg"',
                separator,
                vector,
                '><stop offset="0%" stop-color="',
                _backgroundStartColor(backdropHash, traits),
                '"/><stop offset="100%" stop-color="',
                _backgroundEndColor(backdropHash, traits),
                '"/></linearGradient></defs>'
            )
        );
    }

    function _backgroundShapes(bytes32 backdropHash, IBuddyNFT.BuddyTraits memory traits)
        internal
        pure
        returns (string memory)
    {
        uint256 hue = _baseHue(backdropHash, traits.species);
        uint256 saturation = _baseSaturation(traits.rarity, traits.species);

        return string(
            abi.encodePacked(
                '<g clip-path="url(#vp)"><rect width="420" height="420" fill="url(#bg) ',
                _backgroundFallbackColor(hue, saturation, traits),
                '"/>',
                // Circle centers: backdropHash bytes (4,5)=c0, (6,7)=c1, (8,9)=c2.
                // This mapping MUST match `_driftRulesCss` below — the two call sites
                // are the byte-for-byte parity contract with the reference Python
                // injector. If you change one side, change the other.
                _backgroundCircle(
                    0,
                    _shapeX(backdropHash[4]),
                    _shapeY(backdropHash[5]),
                    52 + (uint256(traits.debugging) / 2),
                    _hsla((hue + 28) % 360, saturation + 10, 66, "0.18")
                ),
                _backgroundCircle(
                    1,
                    _shapeX(backdropHash[6]),
                    _shapeY(backdropHash[7]),
                    42 + (uint256(traits.patience) / 2),
                    _hsla((hue + 108) % 360, saturation, 60, "0.14")
                ),
                _backgroundCircle(
                    2,
                    _shapeX(backdropHash[8]),
                    _shapeY(backdropHash[9]),
                    46 + (uint256(traits.chaos) / 2),
                    _hsla((hue + 188) % 360, saturation + 6, 58, "0.12")
                ),
                "</g>"
            )
        );
    }

    /// @dev Emits an accent circle with a single `fill="hsla(...)"` attribute, merging
    ///      the former `fill="hsl(...)" fill-opacity="0.NN"` pair into one hsla()
    ///      paint. The circle self-closes. Caller provides the pre-built
    ///      `hsla(H,S%,L%,A)` fill color string; keeping the helper signature at 5
    ///      params avoids stack-too-deep at the three call sites in `_backgroundShapes`.
    function _backgroundCircle(
        uint256 i,
        uint256 cx,
        uint256 cy,
        uint256 radius,
        string memory fillColor
    )
        internal
        pure
        returns (string memory)
    {
        return string(
            abi.encodePacked(
                '<circle id="c',
                _decimalDigit(i),
                '" cx="',
                cx.toString(),
                '" cy="',
                cy.toString(),
                '" r="',
                radius.toString(),
                '" fill="',
                fillColor,
                '"/>'
            )
        );
    }

    /// @dev Canonical mix documented by `onchain/contract-data/sprites/sprite-geometry.md`. Spreads small (cx, cy, i) inputs
    /// across 32 bits for period + delay derivation. Multipliers are the Teschner 2003
    /// spatial-hash primes; exact decimal values were cross-verified against the
    /// historical Python injector.
    function _driftMix(uint256 cx, uint256 cy, uint256 i) private pure returns (uint256) {
        unchecked {
            return ((cx * 73856093) ^ (cy * 19349663) ^ (i * 83492791)) & uint256(BuddyDomain.UINT32_MASK);
        }
    }

    /// @dev Emits `#cN{animation:driftN <period>s infinite ease-in-out;animation-delay:-<delay>s}`
    /// and returns a pruned pool with the selected prime removed (order-preserving skip —
    /// matches the reference Python injector's `[p for p in PRIMES if p not in used]`).
    function _driftRule(
        uint256 cx,
        uint256 cy,
        uint256 i,
        bytes memory pool
    )
        private
        pure
        returns (string memory rule, bytes memory prunedPool)
    {
        uint256 poolLen = pool.length;
        uint256 mix = _driftMix(cx, cy, i);
        uint256 pickIdx = mix % poolLen;
        uint256 period = uint256(uint8(pool[pickIdx]));
        uint256 delay = (mix >> 8) % period;

        bytes memory shrunk = new bytes(poolLen - 1);
        uint256 w;
        for (uint256 k = 0; k < poolLen; ++k) {
            if (k == pickIdx) {
                continue;
            }
            shrunk[w++] = pool[k];
        }
        prunedPool = shrunk;

        bytes1 idDigit = _decimalDigit(i);
        rule = string(
            abi.encodePacked(
                "#c",
                idDigit,
                "{animation:drift",
                idDigit,
                " ",
                period.toString(),
                "s infinite ease-in-out;animation-delay:-",
                delay.toString(),
                "s}"
            )
        );
    }

    function _driftRulesCss(bytes32 backdropHash) internal pure returns (string memory) {
        bytes memory pool = new bytes(DRIFT_PRIMES.length);
        for (uint256 k = 0; k < DRIFT_PRIMES.length; ++k) {
            pool[k] = DRIFT_PRIMES[k];
        }

        string memory rule0;
        string memory rule1;
        string memory rule2;
        // backdropHash byte pairs MUST match `_backgroundShapes` above — (4,5)=c0,
        // (6,7)=c1, (8,9)=c2. Changing the mapping here without changing the <circle>
        // cx/cy attributes (or vice versa) breaks byte-for-byte parity with the
        // reference Python injector and the test_tokenURI_pythonParity_pinnedFixture
        // regression guard.
        (rule0, pool) = _driftRule(_shapeX(backdropHash[4]), _shapeY(backdropHash[5]), 0, pool);
        (rule1, pool) = _driftRule(_shapeX(backdropHash[6]), _shapeY(backdropHash[7]), 1, pool);
        (rule2, pool) = _driftRule(_shapeX(backdropHash[8]), _shapeY(backdropHash[9]), 2, pool);

        return string.concat(rule0, rule1, rule2);
    }

    /// @dev SVG 1.1 `<linearGradient>` default vector is `x1="0%" y1="0%" x2="100%" y2="0%"`.
    ///      Gradient vector presets drop attributes that match the default, reducing each
    ///      emitted preset string by 8–35 bytes. Visual equivalence:
    ///      - preset 2 (horizontal) — empty vector; horizontal at top-y and middle-y
    ///        are identical (gradient projects onto the same x-axis for every painted
    ///        pixel), so dropping all four attrs matches the default diagonal-less
    ///        horizontal form.
    ///      - preset 3 (vertical) — requires `x1 == x2`; the default `x1="0%"` matches
    ///        an explicit `x2="0%"`, rendering a pure-vertical gradient.
    ///      Preset 2 returning an empty string triggers the `_backgroundDefs` no-space
    ///      branch so the output is a clean `<linearGradient id="bg">`.
    function _gradientVector(bytes32 backdropHash) internal pure returns (string memory) {
        uint256 preset = uint256(uint8(backdropHash[3])) % 4;

        if (preset == 0) return 'y2="100%"';
        if (preset == 1) return 'x1="100%" x2="0%" y2="100%"';
        if (preset == 2) return "";
        return 'x2="0%" y2="100%"';
    }

    function _backgroundStartColor(bytes32 backdropHash, IBuddyNFT.BuddyTraits memory traits)
        internal
        pure
        returns (string memory)
    {
        return _hsl(_baseHue(backdropHash, traits.species), _baseSaturation(traits.rarity, traits.species), 15);
    }

    function _backgroundEndColor(bytes32 backdropHash, IBuddyNFT.BuddyTraits memory traits)
        internal
        pure
        returns (string memory)
    {
        uint256 hue = _baseHue(backdropHash, traits.species);
        uint256 saturation = _baseSaturation(traits.rarity, traits.species);

        return _hsl((hue + 42 + (uint256(traits.species) * 3)) % 360, saturation + 8, 24 + (uint256(traits.rarity) * 2));
    }

    /// @dev Paint-fallback HSL for the background `<rect>`. Blends the two gradient stops
    ///      along the short arc of the hue wheel at average saturation + lightness.
    ///      Survives `<style>` stripping; in a rich render it is simply overridden by
    ///      `url(#bg)` via SVG paint-fallback semantics. See `docs/onchain/renderer.md`
    ///      § Background paint fallback.
    ///
    ///      Short-arc midpoint rule: if `|end - start|` <= 180 the midpoint is the
    ///      direct average; otherwise the short arc wraps through 0/360 and the
    ///      midpoint is `((start + end + 360) / 2) % 360`. At exactly 180° the
    ///      formula deterministically picks one of the two equivalent midpoints;
    ///      this edge case cannot arise from current renderer math (see
    ///      `docs/onchain/renderer.md` § Background paint fallback). Takes the
    ///      already-computed `startHue` / `startSat` so
    ///      the caller (`_backgroundShapes`) doesn't redundantly invoke `_baseHue` /
    ///      `_baseSaturation`.
    function _backgroundFallbackColor(uint256 startHue, uint256 startSat, IBuddyNFT.BuddyTraits memory traits)
        internal
        pure
        returns (string memory)
    {
        uint256 endHue = (startHue + 42 + (uint256(traits.species) * 3)) % 360;
        uint256 endLight = 24 + (uint256(traits.rarity) * 2);

        uint256 diff = startHue > endHue ? startHue - endHue : endHue - startHue;
        uint256 midHue = diff <= 180 ? (startHue + endHue) / 2 : ((startHue + endHue + 360) / 2) % 360;

        return _hsl(midHue, startSat + 4, (15 + endLight) / 2);
    }


    function _baseHue(bytes32 backdropHash, uint8 species) internal pure returns (uint256) {
        uint256 hue = (
            (uint256(uint8(backdropHash[0])) << 16)
                | (uint256(uint8(backdropHash[1])) << 8)
                | uint256(uint8(backdropHash[2]))
        ) % 360;

        return (hue + (uint256(species) * 11)) % 360;
    }

    function _baseSaturation(uint8 rarity, uint8 species) internal pure returns (uint256) {
        return 42 + (uint256(rarity) * 8) + ((uint256(species) % 4) * 3);
    }

    function _hsl(uint256 hue, uint256 saturation, uint256 lightness) internal pure returns (string memory) {
        return string(
            abi.encodePacked(
                "hsl(",
                hue.toString(),
                ",",
                saturation.toString(),
                "%,",
                lightness.toString(),
                "%)"
            )
        );
    }

    /// @dev Formats the single-string hsla() color for accent circles.
    ///      `alpha` is a pre-formatted decimal literal (`"0.18"` etc.).
    function _hsla(uint256 hue, uint256 saturation, uint256 lightness, string memory alpha)
        internal
        pure
        returns (string memory)
    {
        return string(
            abi.encodePacked(
                "hsla(",
                hue.toString(),
                ",",
                saturation.toString(),
                "%,",
                lightness.toString(),
                "%,",
                alpha,
                ")"
            )
        );
    }

    function _shapeX(bytes1 sourceByte) internal pure returns (uint256) {
        return 36 + ((uint256(uint8(sourceByte)) * 348) / 255);
    }

    function _shapeY(bytes1 sourceByte) internal pure returns (uint256) {
        return 54 + ((uint256(uint8(sourceByte)) * 214) / 255);
    }

    function _speciesLabel(uint8 species) internal pure returns (string memory) {
        if (species == 0) return "Duck";
        if (species == 1) return "Goose";
        if (species == 2) return "Blob";
        if (species == 3) return "Cat";
        if (species == 4) return "Dragon";
        if (species == 5) return "Octopus";
        if (species == 6) return "Owl";
        if (species == 7) return "Penguin";
        if (species == 8) return "Turtle";
        if (species == 9) return "Snail";
        if (species == 10) return "Ghost";
        if (species == 11) return "Axolotl";
        if (species == 12) return "Capybara";
        if (species == 13) return "Cactus";
        if (species == 14) return "Robot";
        if (species == 15) return "Rabbit";
        if (species == 16) return "Mushroom";
        if (species == 17) return "Chonk";
        return "Unknown";
    }

    function _rarityLabel(uint8 rarity) internal pure returns (string memory) {
        if (rarity == 0) return "Common";
        if (rarity == 1) return "Uncommon";
        if (rarity == 2) return "Rare";
        if (rarity == 3) return "Epic";
        if (rarity == 4) return "Legendary";
        return "Unknown";
    }

    function _eyeGlyph(uint8 eyes) internal pure returns (string memory) {
        if (eyes == 0) return unicode"·";
        if (eyes == 1) return unicode"✦";
        if (eyes == 2) return unicode"×";
        if (eyes == 3) return unicode"◉";
        if (eyes == 4) return "@";
        if (eyes == 5) return unicode"°";
        return "?";
    }

    /// @dev Index-aligned with `_eyeGlyph` and `EYE_LABELS` in buddies-source.mjs.
    ///      Surfaces a human-readable trait value in JSON attributes; the SVG
    ///      still uses the glyph from `_eyeGlyph`.
    function _eyeLabel(uint8 eyes) internal pure returns (string memory) {
        if (eyes == 0) return "Dot";
        if (eyes == 1) return "Star";
        if (eyes == 2) return "Cross";
        if (eyes == 3) return "Bullseye";
        if (eyes == 4) return "Spiral";
        if (eyes == 5) return "Ring";
        return "Unknown";
    }

    /// @dev `_hatLabel` is reached only after `_buildSvg` completes. For any
    ///      `hat >= HAT_COUNT`, `_renderSpriteRow` invokes
    ///      `spriteData.getHatRow(hat)` on at least one frame's blank row-0
    ///      (verified across all 18 species' current sprite data), which reverts
    ///      with `InvalidHatIndex` before metadata generation. The implicit
    ///      "Tiny Duck" default for `hat == 7` is therefore the only
    ///      post-`_buildSvg` reachable case. If sprite data ever changes such
    ///      that no species has any blank row-0 frame, this fallback becomes
    ///      reachable and must be restored. See `BuddySpriteData` row-0 schema
    ///      for the invariant.
    function _hatLabel(uint8 hat) internal pure returns (string memory) {
        if (hat == 0) return "None";
        if (hat == 1) return "Crown";
        if (hat == 2) return "Top Hat";
        if (hat == 3) return "Propeller";
        if (hat == 4) return "Halo";
        if (hat == 5) return "Wizard";
        if (hat == 6) return "Beanie";
        return "Tiny Duck";
    }

    function _stageLabel(IBuddyNFT.OwnershipStage stage) internal pure returns (string memory) {
        if (stage == IBuddyNFT.OwnershipStage.Custodial) return "Hatched";
        return "Bonded";
    }

    function _xmlEscape(string memory value) internal pure returns (string memory) {
        bytes memory input = bytes(value);
        bytes memory output = new bytes(input.length * 6);
        uint256 outputLength;

        for (uint256 i = 0; i < input.length; ++i) {
            bytes1 char = input[i];

            if (char == BuddyDomain.ASCII_AMP) {
                output[outputLength++] = BuddyDomain.ASCII_AMP;
                output[outputLength++] = BuddyDomain.ASCII_LOWER_A;
                output[outputLength++] = BuddyDomain.ASCII_LOWER_M;
                output[outputLength++] = BuddyDomain.ASCII_LOWER_P;
                output[outputLength++] = BuddyDomain.ASCII_SEMICOLON;
            } else if (char == BuddyDomain.ASCII_LT) {
                output[outputLength++] = BuddyDomain.ASCII_AMP;
                output[outputLength++] = BuddyDomain.ASCII_LOWER_L;
                output[outputLength++] = BuddyDomain.ASCII_LOWER_T;
                output[outputLength++] = BuddyDomain.ASCII_SEMICOLON;
            } else if (char == BuddyDomain.ASCII_GT) {
                output[outputLength++] = BuddyDomain.ASCII_AMP;
                output[outputLength++] = BuddyDomain.ASCII_LOWER_G;
                output[outputLength++] = BuddyDomain.ASCII_LOWER_T;
                output[outputLength++] = BuddyDomain.ASCII_SEMICOLON;
            } else if (char == BuddyDomain.ASCII_QUOTE) {
                output[outputLength++] = BuddyDomain.ASCII_AMP;
                output[outputLength++] = BuddyDomain.ASCII_LOWER_Q;
                output[outputLength++] = BuddyDomain.ASCII_LOWER_U;
                output[outputLength++] = BuddyDomain.ASCII_LOWER_O;
                output[outputLength++] = BuddyDomain.ASCII_LOWER_T;
                output[outputLength++] = BuddyDomain.ASCII_SEMICOLON;
            } else if (char == BuddyDomain.ASCII_APOSTROPHE) {
                output[outputLength++] = BuddyDomain.ASCII_AMP;
                output[outputLength++] = BuddyDomain.ASCII_LOWER_A;
                output[outputLength++] = BuddyDomain.ASCII_LOWER_P;
                output[outputLength++] = BuddyDomain.ASCII_LOWER_O;
                output[outputLength++] = BuddyDomain.ASCII_LOWER_S;
                output[outputLength++] = BuddyDomain.ASCII_SEMICOLON;
            } else {
                output[outputLength++] = char;
            }
        }

        assembly {
            mstore(output, outputLength)
        }

        return string(output);
    }

    /// @dev Decodes a `bytes16` provider label to its string form, dropping the
    ///      null-padding tail. `hatch` validation guarantees nulls are tail-only,
    ///      so the first null is the end of the label.
    function _trimProvider(bytes16 provider) internal pure returns (string memory) {
        uint256 length;
        while (length < 16 && provider[length] != 0x00) {
            ++length;
        }

        bytes memory out = new bytes(length);
        for (uint256 i = 0; i < length; ++i) {
            out[i] = provider[i];
        }

        return string(out);
    }

    function _jsonEscape(string memory value) internal pure returns (string memory) {
        bytes memory input = bytes(value);
        bytes memory output = new bytes(input.length * 6);
        uint256 outputLength;

        for (uint256 i = 0; i < input.length; ++i) {
            bytes1 char = input[i];

            if (char == BuddyDomain.ASCII_QUOTE || char == BuddyDomain.ASCII_BACKSLASH) {
                output[outputLength++] = BuddyDomain.ASCII_BACKSLASH;
                output[outputLength++] = char;
            } else if (char == 0x08) {
                output[outputLength++] = BuddyDomain.ASCII_BACKSLASH;
                output[outputLength++] = BuddyDomain.ASCII_LOWER_B;
            } else if (char == 0x09) {
                output[outputLength++] = BuddyDomain.ASCII_BACKSLASH;
                output[outputLength++] = BuddyDomain.ASCII_LOWER_T;
            } else if (char == 0x0a) {
                output[outputLength++] = BuddyDomain.ASCII_BACKSLASH;
                output[outputLength++] = BuddyDomain.ASCII_LOWER_N;
            } else if (char == 0x0c) {
                output[outputLength++] = BuddyDomain.ASCII_BACKSLASH;
                output[outputLength++] = BuddyDomain.ASCII_LOWER_F;
            } else if (char == 0x0d) {
                output[outputLength++] = BuddyDomain.ASCII_BACKSLASH;
                output[outputLength++] = BuddyDomain.ASCII_LOWER_R;
            } else if (uint8(char) < 0x20) {
                output[outputLength++] = BuddyDomain.ASCII_BACKSLASH;
                output[outputLength++] = BuddyDomain.ASCII_LOWER_U;
                output[outputLength++] = BuddyDomain.ASCII_DIGIT_0;
                output[outputLength++] = BuddyDomain.ASCII_DIGIT_0;
                output[outputLength++] = _hexDigit(uint8(char) >> 4);
                output[outputLength++] = _hexDigit(uint8(char) & 0x0f);
            } else {
                output[outputLength++] = char;
            }
        }

        assembly {
            mstore(output, outputLength)
        }

        return string(output);
    }

    function _decimalDigit(uint256 value) internal pure returns (bytes1) {
        return DECIMAL_DIGITS[value];
    }

    function _hexDigit(uint8 nibble) internal pure returns (bytes1) {
        return BuddyDomain.LOWERCASE_HEX_DIGITS[nibble];
    }
}
