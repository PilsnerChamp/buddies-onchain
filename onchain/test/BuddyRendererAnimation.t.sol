// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {BuddyRenderer} from "../contracts/BuddyRenderer.sol";

contract BuddyRendererHarness is BuddyRenderer {
    constructor(address d, address f, address sf) BuddyRenderer(d, f, sf) {}

    function animationCss() public pure returns (string memory) {
        return _animationCss();
    }

    function tickMs() public pure returns (uint256) {
        return TICK_MS;
    }

    function idleSequence() public pure returns (bytes memory) {
        return IDLE_SEQUENCE;
    }
}

contract BuddyRendererAnimationTest is Test {
    BuddyRendererHarness harness;

    function setUp() public {
        harness = new BuddyRendererHarness(address(0xdead), address(0xdead), address(0xdead));
    }

    function test_tickMsIs500() public view {
        assertEq(harness.tickMs(), 500);
    }

    function test_idleSequenceMatchesClaudeCodeParity() public view {
        bytes memory sequence = harness.idleSequence();
        uint8[15] memory expected = [uint8(0), 0, 0, 0, 1, 0, 0, 0, 0xFF, 0, 0, 2, 0, 0, 0];

        assertEq(sequence.length, 15);
        for (uint256 i = 0; i < expected.length; ++i) {
            assertEq(uint256(uint8(sequence[i])), uint256(expected[i]));
        }
    }

    function test_animationCssContainsAllKeyframes() public view {
        string memory css = harness.animationCss();

        assertTrue(_contains(css, "@keyframes f0"));
        assertTrue(_contains(css, "@keyframes f1"));
        assertTrue(_contains(css, "@keyframes f2"));
        assertTrue(_contains(css, "@keyframes fb"));
    }

    function test_animationCssContainsAnimationDeclarations() public view {
        string memory css = harness.animationCss();

        _assertAnimationDeclaration(css, "f0");
        _assertAnimationDeclaration(css, "f1");
        _assertAnimationDeclaration(css, "f2");
        _assertAnimationDeclaration(css, "fb");
    }

    function test_animationCssUsesStepStartExactlyFourTimes() public view {
        assertEq(_countOccurrences(harness.animationCss(), "step-start"), 4);
    }

    function test_animationCssUsesOnlyStepStartTiming() public view {
        string memory css = harness.animationCss();

        assertEq(_countOccurrences(css, "ease"), 0);
        assertEq(_countOccurrences(css, "linear"), 0);
        assertEq(_countOccurrences(css, "opacity"), 0);
    }

    function test_animationCss_f1VisibleWindowPinned() public view {
        string memory body = _keyframeBody(harness.animationCss(), "f1");

        assertEq(_countOccurrences(body, "visibility: visible;"), 1);
        assertEq(_countOccurrences(body, "visibility: hidden;"), 2);
        assertEq(_countOccurrences(body, "visibility: "), 3);
        assertTrue(_contains(body, "26.66%, 33.32% { visibility: visible; }"));
    }

    function test_animationCss_f2VisibleWindowPinned() public view {
        string memory body = _keyframeBody(harness.animationCss(), "f2");

        assertEq(_countOccurrences(body, "visibility: visible;"), 1);
        assertEq(_countOccurrences(body, "visibility: hidden;"), 2);
        assertEq(_countOccurrences(body, "visibility: "), 3);
        assertTrue(_contains(body, "73.33%, 79.99% { visibility: visible; }"));
    }

    function test_animationCss_fbVisibleWindowPinned() public view {
        string memory body = _keyframeBody(harness.animationCss(), "fb");

        assertEq(_countOccurrences(body, "visibility: visible;"), 1);
        assertEq(_countOccurrences(body, "visibility: hidden;"), 2);
        assertEq(_countOccurrences(body, "visibility: "), 3);
        assertTrue(_contains(body, "53.33%, 59.99% { visibility: visible; }"));
    }

    function test_animationCss_f0VisibleAndHiddenWindowsPinned() public view {
        string memory body = _keyframeBody(harness.animationCss(), "f0");
        string[4] memory expectedVisible =
            [string("0.00%, 26.65%"), "33.33%, 53.32%", "60.00%, 73.32%", "80.00%, 99.99%"];
        string[3] memory expectedHidden = [string("26.66%, 33.32%"), "53.33%, 59.99%", "73.33%, 79.99%"];

        assertEq(_countOccurrences(body, "visibility: visible;"), 4);
        assertEq(_countOccurrences(body, "visibility: hidden;"), 3);
        assertEq(_countOccurrences(body, "visibility: "), 7);

        for (uint256 i = 0; i < expectedVisible.length; ++i) {
            assertTrue(_contains(body, string.concat(expectedVisible[i], " { visibility: visible; }")));
        }

        for (uint256 i = 0; i < expectedHidden.length; ++i) {
            assertTrue(_contains(body, string.concat(expectedHidden[i], " { visibility: hidden; }")));
        }
    }

    function _assertAnimationDeclaration(string memory css, string memory name) internal pure {
        string memory compactCss = _stripWhitespace(css);
        string memory expected = string.concat("#", name, "{animation:", name, "7500msinfinitestep-start;}");

        assertTrue(_contains(compactCss, expected));
    }

    function _keyframeBody(string memory css, string memory name) internal pure returns (string memory) {
        string memory marker = string.concat("@keyframes ", name);
        uint256 markerIndex = _find(css, marker);
        bytes memory cssBytes = bytes(css);
        uint256 openBraceIndex;
        uint256 depth = 1;

        if (markerIndex == type(uint256).max) {
            revert("missing keyframe");
        }

        openBraceIndex = markerIndex + bytes(marker).length;
        while (openBraceIndex < cssBytes.length && cssBytes[openBraceIndex] != hex"7b") {
            ++openBraceIndex;
        }
        if (openBraceIndex == cssBytes.length) {
            revert("missing open brace");
        }

        uint256 bodyStart = openBraceIndex + 1;
        for (uint256 i = bodyStart; i < cssBytes.length; ++i) {
            if (cssBytes[i] == hex"7b") {
                ++depth;
            } else if (cssBytes[i] == hex"7d") {
                --depth;
                if (depth == 0) {
                    return _slice(cssBytes, bodyStart, i);
                }
            }
        }

        revert("missing closing brace");
    }

    function _stripWhitespace(string memory value) internal pure returns (string memory) {
        bytes memory input = bytes(value);
        bytes memory output = new bytes(input.length);
        uint256 outputLength;

        for (uint256 i = 0; i < input.length; ++i) {
            if (input[i] == hex"20" || input[i] == hex"09" || input[i] == hex"0a" || input[i] == hex"0d") {
                continue;
            }

            output[outputLength++] = input[i];
        }

        assembly {
            mstore(output, outputLength)
        }

        return string(output);
    }

    function _slice(bytes memory value, uint256 start, uint256 endExclusive) internal pure returns (string memory) {
        bytes memory output = new bytes(endExclusive - start);

        for (uint256 i = 0; i < output.length; ++i) {
            output[i] = value[start + i];
        }

        return string(output);
    }

    function _contains(string memory haystack, string memory needle) internal pure returns (bool) {
        return _find(haystack, needle) != type(uint256).max;
    }

    function _find(string memory haystack, string memory needle) internal pure returns (uint256) {
        bytes memory haystackBytes = bytes(haystack);
        bytes memory needleBytes = bytes(needle);

        if (needleBytes.length == 0) {
            return 0;
        }
        if (needleBytes.length > haystackBytes.length) {
            return type(uint256).max;
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
