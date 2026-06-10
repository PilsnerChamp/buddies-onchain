// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC4906} from "@openzeppelin/contracts/interfaces/IERC4906.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

import {IBuddyNFT} from "./interfaces/IBuddyNFT.sol";
import {IBuddyRenderer} from "./interfaces/IBuddyRenderer.sol";
import {IERC5192} from "./interfaces/IERC5192.sol";
import {AuthorAttestation} from "./libraries/AuthorAttestation.sol";
import {BuddyDomain} from "./libraries/BuddyDomain.sol";
import {Mulberry32} from "./libraries/Mulberry32.sol";

/// @title BuddyNFT
/// @notice Soulbound ERC721 for Claude Code Buddy companions on Base L2.
/// @dev Hatches custodially to the contract and bonds later via attestation.
contract BuddyNFT is ERC721, Ownable, EIP712, IBuddyNFT, IERC4906, IERC5192 {
    uint256 public constant MAX_NAME_LENGTH = 14;

    /// @notice Immutable address of the cold ECDSA key used to sign authorship
    ///         attestations on request. The private key lives offline and never
    ///         touches deploys, mints, or admin calls. No real name lives on-chain.
    /// @dev    Resolved from `AuthorAttestation.SIGNER` (committed real cold-key
    ///         address). Shipping `address(0)` would brick attestation verification;
    ///         the library constant is sanity-checked at deploy time.
    address public constant AUTHOR_ATTESTATION_SIGNER = AuthorAttestation.SIGNER;

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error Soulbound();
    error RendererNotSet();
    error ZeroAddress();
    error NameTooLong(uint256 length);
    error InvalidIdentityHash();
    error InvalidProvider();
    error AlreadyHatched();
    error BondingNotEnabled();
    error BondingAlreadyEnabled();
    error AttestationExpired();
    error InvalidAttestation();
    error InvalidSignature();

    // -------------------------------------------------------------------------
    // Enums & Structs
    // -------------------------------------------------------------------------

    struct BondAttestation {
        uint256 tokenId;
        bytes32 identityHash;
        address recipient;
        uint64 expiry;
    }

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event Awakened(uint256 indexed tokenId, bytes32 indexed identityHash, address indexed hatcher, bytes16 provider);
    event BuddyBonded(uint256 indexed tokenId, bytes32 indexed identityHash, address indexed recipient, string name);
    event RendererUpdated(address indexed renderer);
    event AttestationSignerUpdated(address indexed signer);
    event BondingEnabled();

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    bytes32 private constant BOND_ATTESTATION_TYPEHASH =
        keccak256("BondAttestation(uint256 tokenId,bytes32 identityHash,address recipient,uint64 expiry)");

    // -------------------------------------------------------------------------
    // Storage
    // -------------------------------------------------------------------------

    mapping(uint256 tokenId => IBuddyNFT.BuddyTraits) private _tokenTraits;
    mapping(uint256 tokenId => string) private _tokenNames;
    mapping(uint256 tokenId => IBuddyNFT.OwnershipStage) private _tokenStages;
    mapping(uint256 tokenId => bytes32) private _tokenIdentityHashes;
    mapping(uint256 tokenId => uint32) private _tokenPrngSeeds;
    mapping(uint256 tokenId => bytes16) private _tokenProviders;
    mapping(bytes32 identityHash => uint256 tokenId) private _identityHashToTokenId;
    mapping(bytes32 identityHash => bool) private _minted;
    mapping(uint256 tokenId => address) private _hatcher;

    address private _attestationSigner;
    bool public bondingEnabled;
    address private _rendererAddress;
    uint256 private _nextTokenId = 1;

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(address initialOwner, address initialRenderer)
        ERC721("Buddies Onchain", "BUDDY")
        Ownable(initialOwner)
        EIP712("BuddyNFT", "1")
    {
        _rendererAddress = initialRenderer;

        if (initialRenderer != address(0)) {
            emit RendererUpdated(initialRenderer);
        }
    }

    // -------------------------------------------------------------------------
    // View Functions
    // -------------------------------------------------------------------------

    function attestationSigner() external view returns (address) {
        return _attestationSigner;
    }

    function renderer() external view returns (address) {
        return _rendererAddress;
    }

    function totalSupply() external view returns (uint256) {
        return _nextTokenId - 1;
    }

    function contractURI() external pure returns (string memory) {
        return string.concat(
            "data:application/json;utf8,",
            '{"name":"Buddies Onchain","description":"',
            "One account. One buddy. Lives on-chain. A soulbound identity artifact for developers who use AI coding tools: a fully on-chain SVG with deterministic traits derived from the account, held at the contract and bound to an identity hash, not a wallet. Born from the Claude Code terminal buddy. An unofficial community project, not endorsed by Anthropic.",
            '","image":"',
            BuddyDomain.SITE_ORIGIN,
            "/og-home.svg",
            '","external_link":"',
            BuddyDomain.SITE_ORIGIN,
            '"}'
        );
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC721, IERC165) returns (bool) {
        // EIP-4906 id (0x49064906) is hand-derived from the two event selectors;
        // type(IERC4906).interfaceId would be 0x00000000 since the interface declares no functions.
        return interfaceId == bytes4(0x49064906) || interfaceId == type(IERC5192).interfaceId
            || super.supportsInterface(interfaceId);
    }

    function getStage(uint256 tokenId) external view override returns (IBuddyNFT.OwnershipStage) {
        _requireOwned(tokenId);
        return _tokenStages[tokenId];
    }

    function locked(uint256 tokenId) external view override returns (bool) {
        _requireOwned(tokenId);
        return _tokenStages[tokenId] == IBuddyNFT.OwnershipStage.Bonded;
    }

    function getTokenIdByIdentity(bytes32 identityHash) external view returns (uint256) {
        return _identityHashToTokenId[identityHash];
    }

    function isMinted(bytes32 identityHash) external view returns (bool) {
        return _minted[identityHash];
    }

    function buddyTraits(uint256 tokenId) external view override returns (IBuddyNFT.BuddyTraits memory) {
        _requireOwned(tokenId);
        return _tokenTraits[tokenId];
    }

    function buddyName(uint256 tokenId) external view override returns (string memory) {
        _requireOwned(tokenId);
        return _tokenNames[tokenId];
    }

    function buddyIdentityHash(uint256 tokenId) external view override returns (bytes32) {
        _requireOwned(tokenId);
        return _tokenIdentityHashes[tokenId];
    }

    function buddyPrngSeed(uint256 tokenId) external view override returns (uint32) {
        _requireOwned(tokenId);
        return _tokenPrngSeeds[tokenId];
    }

    function buddyProvider(uint256 tokenId) external view override returns (bytes16) {
        _requireOwned(tokenId);
        return _tokenProviders[tokenId];
    }

    function hatcher(uint256 tokenId) external view returns (address) {
        _requireOwned(tokenId);
        return _hatcher[tokenId];
    }

    // -------------------------------------------------------------------------
    // Owner Admin Functions
    // -------------------------------------------------------------------------

    function setAttestationSigner(address newSigner) external onlyOwner {
        if (bondingEnabled && newSigner == address(0)) {
            revert ZeroAddress();
        }

        _attestationSigner = newSigner;
        emit AttestationSignerUpdated(newSigner);
    }

    function enableBonding() external onlyOwner {
        if (bondingEnabled) {
            revert BondingAlreadyEnabled();
        }

        if (_attestationSigner == address(0)) {
            revert ZeroAddress();
        }

        bondingEnabled = true;
        emit BondingEnabled();
    }

    function setRenderer(address newRenderer) external onlyOwner {
        if (newRenderer == address(0)) {
            revert ZeroAddress();
        }

        _rendererAddress = newRenderer;
        emit RendererUpdated(newRenderer);
        // Full-collection renderer swap; OpenSea/indexers recognize this range.
        emit BatchMetadataUpdate(0, type(uint256).max);
    }

    function renounceOwnership() public override onlyOwner {
        // Revert: owner must enable bonding before renouncing.
        if (!bondingEnabled) {
            revert BondingNotEnabled();
        }

        super.renounceOwnership();
    }

    // -------------------------------------------------------------------------
    // Hatch & Bond
    // -------------------------------------------------------------------------

    function hatch(bytes32 identityHash, uint32 prngSeed, bytes16 provider) external returns (uint256 tokenId) {
        if (identityHash == bytes32(0)) {
            revert InvalidIdentityHash();
        }

        if (_minted[identityHash]) {
            revert AlreadyHatched();
        }

        _validateProvider(provider);

        IBuddyNFT.BuddyTraits memory traits = _deriveTraits(prngSeed);

        tokenId = _nextTokenId++;

        _tokenTraits[tokenId] = traits;
        _tokenPrngSeeds[tokenId] = prngSeed;
        _tokenProviders[tokenId] = provider;
        _tokenIdentityHashes[tokenId] = identityHash;
        _identityHashToTokenId[identityHash] = tokenId;
        _minted[identityHash] = true;
        _tokenStages[tokenId] = IBuddyNFT.OwnershipStage.Custodial;
        _hatcher[tokenId] = msg.sender;

        _mint(address(this), tokenId);

        emit Awakened(tokenId, identityHash, msg.sender, provider);
    }

    function bond(uint256 tokenId, string calldata name, BondAttestation calldata attestation, bytes calldata signature)
        external
    {
        if (!bondingEnabled) {
            revert BondingNotEnabled();
        }

        _requireOwned(tokenId);

        if (_tokenStages[tokenId] != IBuddyNFT.OwnershipStage.Custodial) {
            revert Soulbound();
        }

        if (attestation.tokenId != tokenId) {
            revert InvalidAttestation();
        }

        if (attestation.identityHash != _tokenIdentityHashes[tokenId]) {
            revert InvalidAttestation();
        }

        if (attestation.recipient != msg.sender) {
            revert InvalidAttestation();
        }

        if (attestation.expiry < block.timestamp) {
            revert AttestationExpired();
        }

        _verifySignature(_hashBondAttestation(attestation), signature);
        _validateName(name);
        _tokenNames[tokenId] = name;
        // `_transfer` (not `_safeTransfer`) is intentional. `recipient == msg.sender`
        // is enforced above, so the receiver opted into bonding. `_safeTransfer`
        // would reject smart-account wallets that hold ERC-721s via balance
        // tracking without implementing `onERC721Received`, bricking their bond
        // despite a valid attestation.
        _transfer(address(this), msg.sender, tokenId);
        _tokenStages[tokenId] = IBuddyNFT.OwnershipStage.Bonded;

        emit Locked(tokenId);
        emit MetadataUpdate(tokenId);
        emit BuddyBonded(tokenId, _tokenIdentityHashes[tokenId], msg.sender, name);
    }

    // -------------------------------------------------------------------------
    // Token URI
    // -------------------------------------------------------------------------

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);

        address rendererAddress = _rendererAddress;
        if (rendererAddress == address(0)) {
            revert RendererNotSet();
        }

        return IBuddyRenderer(rendererAddress).tokenURI(address(this), tokenId);
    }

    // -------------------------------------------------------------------------
    // Soulbound Enforcement
    // -------------------------------------------------------------------------

    function approve(address, uint256) public pure override(ERC721, IERC721) {
        revert Soulbound();
    }

    function setApprovalForAll(address, bool) public pure override(ERC721, IERC721) {
        revert Soulbound();
    }

    function _update(address to, uint256 tokenId, address auth) internal override returns (address from) {
        from = _ownerOf(tokenId);

        if (from == address(0)) {
            return super._update(to, tokenId, auth);
        }

        if (from == address(this) && _tokenStages[tokenId] == IBuddyNFT.OwnershipStage.Custodial) {
            return super._update(to, tokenId, auth);
        }

        revert Soulbound();
    }

    // -------------------------------------------------------------------------
    // Internal Helpers
    // -------------------------------------------------------------------------

    function _validateName(string memory name_) internal pure {
        if (bytes(name_).length > MAX_NAME_LENGTH) {
            revert NameTooLong(bytes(name_).length);
        }
    }

    /// @dev Provider label: lowercase ascii `[a-z0-9-]`, null-padded tail-only,
    ///      first byte non-null (empty rejected). Stored verbatim; self-declared.
    function _validateProvider(bytes16 provider) internal pure {
        bool padding;
        for (uint256 i = 0; i < 16; ++i) {
            bytes1 c = provider[i];
            if (c == 0x00) {
                // First null begins the padding tail; the rest must stay null.
                if (i == 0) revert InvalidProvider();
                padding = true;
            } else if (padding) {
                // Non-null after a null is an interior null — reject.
                revert InvalidProvider();
            } else if (!((c >= 0x61 && c <= 0x7a) || (c >= 0x30 && c <= 0x39) || c == 0x2d)) {
                // Not [a-z], [0-9], or '-'.
                revert InvalidProvider();
            }
        }
    }

    function _deriveTraits(uint32 prngSeed) internal pure returns (IBuddyNFT.BuddyTraits memory traits) {
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
        ) = Mulberry32.deriveTraits(prngSeed);

        traits = IBuddyNFT.BuddyTraits({
            species: species,
            rarity: rarity,
            eyes: eyes,
            hat: hat,
            shiny: shiny,
            debugging: debugging,
            patience: patience,
            chaos: chaos,
            wisdom: wisdom,
            snark: snark
        });
    }

    function _hashBondAttestation(BondAttestation calldata attestation) internal pure returns (bytes32) {
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

    function _verifySignature(bytes32 structHash, bytes calldata signature) internal view {
        bytes32 digest = _hashTypedDataV4(structHash);
        (address recovered, ECDSA.RecoverError error,) = ECDSA.tryRecoverCalldata(digest, signature);
        if (error != ECDSA.RecoverError.NoError || recovered != _attestationSigner) {
            revert InvalidSignature();
        }
    }
}
