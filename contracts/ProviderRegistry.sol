// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ProviderRegistry
 * @dev Registry for AI and API providers to register endpoints and pricing models.
 * Used by gateway to validate providers and route payments.
 */
contract ProviderRegistry is Ownable {
    struct Provider {
        address adminAddress;
        string name;
        string endpoint; // Base URL or identifier
        bytes32 publicKeyHash; // Hash of provider's public key for receipt verification
        bool isActive;
        uint256 registeredAt;
    }

    struct PricingRule {
        bytes32 endpointHash; // Hash of endpoint + params for uniqueness
        uint256 minBudget; // Minimum USDC locked (in wei/usdc smallest units)
        uint256 maxBudget; // Maximum allowd (0 = unlimited)
        uint256 basePrice; // Wei per call
        uint256 pricePerToken; // For AI endpoints, wei per token (prompt + completion)
        uint256 pricePerKb; // For data endpoints, wei per KB
        uint256 slaTimeout; // Seconds after which refund triggers
    }

    mapping(address => Provider) public providers;
    mapping(bytes32 => PricingRule) public pricingRules; // endpointHash => rule
    mapping(address => bool) public authorizedGateways;

    address[] public providerList;

    event ProviderRegistered(address indexed provider, string name, string endpoint);
    event ProviderUpdated(address indexed provider, string newEndpoint);
    event ProviderDeactivated(address indexed provider);
    event PricingRuleSet(bytes32 indexed endpointHash, uint256 basePrice);
    event GatewayAuthorized(address indexed gateway);
    event GatewayRevoked(address indexed gateway);

    constructor() Ownable(msg.sender) {}

    modifier onlyProvider() {
        require(providers[msg.sender].adminAddress == msg.sender, "Not registered provider");
        _;
    }

    modifier onlyAuthorizedGateway() {
        require(authorizedGateways[msg.sender], "Not authorized gateway");
        _;
    }

    /**
     * @dev Register a new provider
     * @param name  name
     * @param endpoint Base API endpoint
     * @param publicKeyHash Hash of public key for receipt verification
     */
    function registerProvider(
        string calldata name,
        string calldata endpoint,
        bytes32 publicKeyHash
    ) external {
        require(providers[msg.sender].adminAddress == address(0), "Already registered");

        providers[msg.sender] = Provider({
            adminAddress: msg.sender,
            name: name,
            endpoint: endpoint,
            publicKeyHash: publicKeyHash,
            isActive: true,
            registeredAt: block.timestamp
        });

        providerList.push(msg.sender);

        emit ProviderRegistered(msg.sender, name, endpoint);
    }

    /**
     * @dev Update provider details
     */
    function updateProvider(
        string calldata name,
        string calldata endpoint,
        bytes32 publicKeyHash
    ) external onlyProvider {
        Provider storage provider = providers[msg.sender];
        provider.name = name;
        provider.endpoint = endpoint;
        provider.publicKeyHash = publicKeyHash;

        emit ProviderUpdated(msg.sender, endpoint);
    }

    /**
     * @dev Deactivate provider
     */
    function deactivateProvider() external onlyProvider {
        providers[msg.sender].isActive = false;
        emit ProviderDeactivated(msg.sender);
    }

    /**
     * @dev Set pricing rule for an endpoint
     * @param endpointHash Unique hash of endpoint + params
     * @param minBudget Minimum budget in smallest units
     * @param maxBudget Maximum budget (0 = unlimited)
     * @param basePrice Base price per call
     * @param pricePerToken For AI, price per token
     * @param pricePerKb For data, price per KB
     * @param slaTimeout SLA timeout in seconds
     */
    function setPricingRule(
        bytes32 endpointHash,
        uint256 minBudget,
        uint256 maxBudget,
        uint256 basePrice,
        uint256 pricePerToken,
        uint256 pricePerKb,
        uint256 slaTimeout
    ) external onlyProvider {
        require(providers[msg.sender].isActive, "Provider not active");

        pricingRules[endpointHash] = PricingRule({
            endpointHash: endpointHash,
            minBudget: minBudget,
            maxBudget: maxBudget,
            basePrice: basePrice,
            pricePerToken: pricePerToken,
            pricePerKb: pricePerKb,
            slaTimeout: slaTimeout
        });

        emit PricingRuleSet(endpointHash, basePrice);
    }

    /**
     * @dev Get pricing for an endpoint
     */
    function getPricing(bytes32 endpointHash) external view returns (PricingRule memory) {
        return pricingRules[endpointHash];
    }

    /**
     * @dev Verify if provider signature is valid (helper for gateway)
     * This would typically be done offchain, but providing onchain helper
     */
    function isValidProviderSignature(
        bytes32 intentId,
        address provider,
        bytes32 receiptHash,
        bytes memory signature
    ) external view returns (bool) {
        string memory prefix = "\x19Ethereum Signed Message:\n84";
        bytes32 messageHash = keccak256(abi.encodePacked(prefix, intentId, provider, receiptHash));
        address recovered = recoverSigner(messageHash, signature);
        return recovered == provider && providers[provider].isActive;
    }

    function getRecovered(bytes32 intentId, address provider, bytes32 receiptHash, bytes memory signature) external view returns (address) {
        string memory prefix = "\x19Ethereum Signed Message:\n84";
        bytes32 messageHash = keccak256(abi.encodePacked(prefix, intentId, provider, receiptHash));
        return recoverSigner(messageHash, signature);
    }

    /**
     * @dev Add authorized gateway (only owner)
     */
    function authorizeGateway(address gateway) external onlyOwner {
        authorizedGateways[gateway] = true;
        emit GatewayAuthorized(gateway);
    }

    /**
     * @dev Revoke gateway authorization
     */
    function revokeGateway(address gateway) external onlyOwner {
        authorizedGateways[gateway] = false;
        emit GatewayRevoked(gateway);
    }

    /**
     * @dev Get total registered providers
     */
    function getProviderCount() external view returns (uint256) {
        return providerList.length;
    }

    /**
     * @dev Check if provider is active
     */
    function isProviderActive(address addr) external view returns (bool) {
        return providers[addr].isActive;
    }

    /**
     * @dev Simple ECDSA recovery (for signature verification)
     */
    function recoverSigner(bytes32 message, bytes memory sig) internal pure returns (address) {
        bytes32 r;
        bytes32 s;
        uint8 v;

        require(sig.length == 65, "Invalid signature length");

        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }

        if (v < 27) {
            v += 27;
        }

        require(v == 27 || v == 28, "Invalid signature v value");

        return ecrecover(message, v, r, s);
    }
}
