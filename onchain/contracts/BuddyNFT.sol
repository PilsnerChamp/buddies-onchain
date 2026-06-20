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
/// @notice Soulbound ERC721 for AI-coding-tool buddy companions on Base L2.
/// @dev Hatches custodially to the contract and is claimed later via attestation.
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
    error AlreadyBonded();
    error BondingNotEnabled();
    error BondingAlreadyEnabled();
    error AttestationExpired();
    error InvalidAttestation();
    error InvalidSignature();

    // -------------------------------------------------------------------------
    // Enums & Structs
    // -------------------------------------------------------------------------

    /// @dev The single Stage-2 attestation. No tokenId: claim() resolves token
    ///      state from `identityHash` at execution time, so a signed claim can
    ///      never replay against a burned/wrong tokenId (bonded state is the
    ///      replay nonce). `provider` + `name` are signer-attested SOFT metadata —
    ///      "attested, not cryptographically true": the signer signs what it is
    ///      given and gates authorization + accountability, NOT truth. Only the
    ///      SEED is identity/art-validity. Member order MUST equal the typehash
    ///      string order — `abi.encode` hashes by position; a silent reorder
    ///      breaks every signed digest.
    struct ClaimAttestation {
        bytes32 identityHash;
        uint32 prngSeed;
        bytes16 provider;
        string name;
        address recipient;
        uint64 expiry;
    }

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event Awakened(uint256 indexed tokenId, bytes32 indexed identityHash, address indexed hatcher, bytes16 provider);
    event BuddyClaimed(uint256 indexed tokenId, bytes32 indexed identityHash, address indexed recipient, string name);
    event Reclaimed(
        uint256 indexed oldTokenId, uint256 indexed newTokenId, bytes32 indexed identityHash, address reclaimer
    );
    event RendererUpdated(address indexed renderer);
    event AttestationSignerUpdated(address indexed signer);
    event BondingEnabled();

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    bytes32 private constant CLAIM_ATTESTATION_TYPEHASH = keccak256(
        "ClaimAttestation(bytes32 identityHash,uint32 prngSeed,bytes16 provider,string name,address recipient,uint64 expiry)"
    );

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
            "One account. One buddy. Lives on-chain. A soulbound identity artifact for developers who use AI coding tools, born in the terminal and bound to your account.",
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
    // Hatch & Claim
    // -------------------------------------------------------------------------

    function hatch(bytes32 identityHash, uint32 prngSeed, bytes16 provider) external returns (uint256 tokenId) {
        if (identityHash == bytes32(0)) {
            revert InvalidIdentityHash();
        }

        if (_minted[identityHash]) {
            revert AlreadyHatched();
        }

        _validateProvider(provider);

        tokenId = _mintBuddy(identityHash, prngSeed, provider);
    }

    /// @notice The single Stage-2 door. Atomically resolves the identity's state
    ///         and brings the buddy home to `msg.sender`, minting/repairing as
    ///         needed, in one transaction — no separate bond/reclaim selectors.
    /// @dev Vocabulary split is deliberate: `claim()` is the single public
    ///      Stage-2 ACTION (the user's verb/door); the terminal state is
    ///      `OwnershipStage.Bonded` (soulbound, non-transferable), rendered
    ///      on-chain as "Bonded". Internal helpers stay state/mechanic-named
    ///      (`_bondCustodialToken`, `_replaceWrongSeedToken`) because their
    ///      branches produce the Bonded state. This is not stale two-door naming;
    ///      do not rename them to `_claim*`.
    /// @dev Whole call is atomic: there is no repair-only success. All token state
    ///      below is read from LIVE storage, never from the calldata attestation:
    ///      `provider`/`name` are SOFT metadata (set/overwritten at claim, never
    ///      a burn trigger); only a wrong SEED triggers a burn + remint. The single
    ///      safety-inverting line is the stored-seed read in the branch resolver.
    ///      No external call anywhere here (or in the internals it calls), so
    ///      atomicity + no-reentrancy are free: only `_transfer`/`_mint`/`_burn`.
    /// @return tokenId The final bonded tokenId — the existing id (honest branch),
    ///         or the new id (no-token + wrong-seed branches).
    function claim(ClaimAttestation calldata attestation, bytes calldata signature) external returns (uint256 tokenId) {
        if (!bondingEnabled) {
            revert BondingNotEnabled();
        }

        bytes32 identityHash = attestation.identityHash;
        if (identityHash == bytes32(0)) {
            revert InvalidIdentityHash();
        }

        _validateProvider(attestation.provider);
        _validateName(attestation.name);

        if (attestation.recipient != msg.sender) {
            revert InvalidAttestation();
        }

        if (attestation.expiry < block.timestamp) {
            revert AttestationExpired();
        }

        _verifySignature(_hashClaimAttestation(attestation), signature);

        // Resolution + branch (security C1). No-token branch first; otherwise read
        // STAGE before any seed read — a bonded token can never reach the replace
        // path. The stored-seed read below is the single safety-inverting line:
        // burn predicate = SEED-ONLY, always from LIVE storage.
        if (!_minted[identityHash]) {
            // no-token: mint then bond. seed/provider/name come from attestation.
            tokenId = _mintBuddy(identityHash, attestation.prngSeed, attestation.provider);
            _bondCustodialToken(tokenId, attestation);
            return tokenId;
        }

        tokenId = _identityHashToTokenId[identityHash];
        _requireOwned(tokenId);

        if (_tokenStages[tokenId] == IBuddyNFT.OwnershipStage.Bonded) {
            revert AlreadyBonded();
        }

        if (attestation.prngSeed == _tokenPrngSeeds[tokenId]) {
            // custodial, stored seed == attested seed: honest — bond, no burn.
            _bondCustodialToken(tokenId, attestation);
            return tokenId;
        }

        // custodial, stored seed != attested seed: burn + remint, then bond.
        tokenId = _replaceWrongSeedToken(identityHash, tokenId, attestation);
        _bondCustodialToken(tokenId, attestation);
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

    /// @dev Full hatch write-set + identity-registry pointing, shared verbatim by
    ///      hatch() and claim() (no-token + wrong-seed branches, via
    ///      _replaceWrongSeedToken) so the replacement mint can never drift from a
    ///      normal hatch. Callers own validation and registry release.
    function _mintBuddy(bytes32 identityHash, uint32 prngSeed, bytes16 provider) private returns (uint256 tokenId) {
        tokenId = _nextTokenId++;

        _tokenTraits[tokenId] = _deriveTraits(prngSeed);
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

    /// @dev Bond a custodial token to `msg.sender`. Overwrites provider + sets the
    ///      name from the attestation (both SOFT metadata, self-healing at claim),
    ///      then transfers out of custody and flips the stage to Bonded. The lone
    ///      shared bond tail across all claim branches; emits the canonical bond
    ///      end-sequence `Locked -> MetadataUpdate -> BuddyClaimed`.
    function _bondCustodialToken(uint256 tokenId, ClaimAttestation calldata attestation) private {
        _tokenProviders[tokenId] = attestation.provider;
        _tokenNames[tokenId] = attestation.name;
        // `_transfer` (not `_safeTransfer`) is intentional. `recipient == msg.sender`
        // is enforced in claim(), so the receiver opted into the claim. `_safeTransfer`
        // would reject smart-account wallets that hold ERC-721s via balance
        // tracking without implementing `onERC721Received`, bricking their claim
        // despite a valid attestation.
        _transfer(address(this), msg.sender, tokenId);
        _tokenStages[tokenId] = IBuddyNFT.OwnershipStage.Bonded;

        emit Locked(tokenId);
        // Provider is overwritten + name set here, so metadata changed on every
        // branch — including the honest custodial one.
        emit MetadataUpdate(tokenId);
        emit BuddyClaimed(tokenId, _tokenIdentityHashes[tokenId], msg.sender, attestation.name);
    }

    /// @dev Burn a wrong-seed custodial token and re-hatch the identity with the
    ///      ATTESTED seed/provider, in one transaction (no re-squat race). Reached
    ///      only when the stored seed differs from the attested seed (burn predicate
    ///      = SEED-ONLY); the Bonded stage gate in claim() runs first, so a bonded
    ///      token can never get here. The guarantee is signer-conditional, not
    ///      structural — a signer attesting an arbitrary different seed reaches any
    ///      custodial token (owner and signer are one trust class; see SECURITY.md).
    function _replaceWrongSeedToken(bytes32 identityHash, uint256 oldTokenId, ClaimAttestation calldata attestation)
        private
        returns (uint256 newTokenId)
    {
        // _mintBuddy below consumes exactly _nextTokenId; pre-read so Reclaimed
        // can lead the event sequence (Reclaimed, burn Transfer, mint Transfer,
        // Awakened) for indexers.
        emit Reclaimed(oldTokenId, _nextTokenId, identityHash, msg.sender);

        // Existing _update gate already permits burn-from-custody (from ==
        // address(this) && Custodial). The squat's per-token mappings go dead
        // behind _requireOwned; only the identity registry is released.
        _burn(oldTokenId);
        delete _minted[identityHash];
        delete _identityHashToTokenId[identityHash];

        newTokenId = _mintBuddy(identityHash, attestation.prngSeed, attestation.provider);
    }

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

    /// @dev EIP-712 struct hash. `name` is a dynamic string, so it is hashed as
    ///      `keccak256(bytes(name))` (NOT the raw bytes) per the EIP-712 spec; the
    ///      TS signer + vector generator must match these UTF-8 bytes exactly.
    function _hashClaimAttestation(ClaimAttestation calldata attestation) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                CLAIM_ATTESTATION_TYPEHASH,
                attestation.identityHash,
                attestation.prngSeed,
                attestation.provider,
                keccak256(bytes(attestation.name)),
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
