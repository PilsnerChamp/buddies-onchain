// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";

abstract contract BuddyFontPayload {
    error UnexpectedPayloadLength(uint256 actual, uint256 expected);
    error UnexpectedPayloadSha256(bytes32 actual, bytes32 expected);

    string private constant DATA_URI_PREFIX = "data:font/woff2;base64,";

    bytes private sPayload;

    constructor(bytes memory payload_, uint256 expectedLength, bytes32 expectedHash) {
        if (payload_.length != expectedLength) {
            revert UnexpectedPayloadLength(payload_.length, expectedLength);
        }

        bytes32 payloadHash = sha256(payload_);
        if (payloadHash != expectedHash) {
            revert UnexpectedPayloadSha256(payloadHash, expectedHash);
        }

        sPayload = payload_;
    }

    function payload() external view returns (bytes memory) {
        return sPayload;
    }

    function fontDataUri() public view returns (string memory) {
        bytes memory payload_ = sPayload;
        return string.concat(DATA_URI_PREFIX, Base64.encode(payload_));
    }

    function fontCss() external view returns (string memory) {
        return string.concat(_fontFacePrefix(), fontDataUri(), _fontFaceSuffix());
    }

    function _fontFacePrefix() internal pure virtual returns (string memory);

    function _fontFaceSuffix() internal pure virtual returns (string memory);
}
