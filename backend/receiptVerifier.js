/**
 * @file receiptVerifier.js
 * @description Receipt validation, nonce management, and cryptographic verification
 */

const crypto = require('crypto');
const ethers = require('ethers');

// In-memory nonce tracking for replay protection (use Redis in production)
const processedNonces = new Set();
const maxNonceAge = 24 * 60 * 60 * 1000; // 24 hours
const nonceStore = new Map(); // nonce => timestamp

// Known provider public keys (in production, fetch from onchain registry)
const providerKeys = new Map(Object.entries({
  // Example providers - in production, pull from ProviderRegistry contract
  example_provider_1: '0x...',
  example_provider_2: '0x...'
}));

/**
 * Generate a unique intent ID
 * @returns {string} UUID-like intent ID
 */
function generateIntentId() {
  return crypto.randomUUID().replace(/-/g, '').substring(0, 16).toUpperCase();
}

/**
 * Validate usage receipt signature and metadata
 * @param {Object} receipt - Receipt object from provider
 * @param {Object} options - Validation options
 * @returns {boolean} True if valid
 */
function validateReceipt(receipt, options = {}) {
  try {
    // Required fields check
    const requiredFields = [
      'intentId',
      'usedAmount',
      'tokensUsed',
      'endpointHash',
      'nonce',
      'timestamp',
      'provider',
      'payoutChain'
    ];

    for (const field of requiredFields) {
      if (!(field in receipt)) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // Signature validation
    if (!receipt.signature) {
      throw new Error('Missing signature');
    }

    if (!validateSignature(receipt, options.providerKey)) {
      throw new Error('Invalid signature');
    }

    // Nonce validation for replay protection
    if (!validateNonce(receipt.nonce)) {
      throw new Error('Invalid or replayed nonce');
    }

    // Timestamp validation (not too old, not in future)
    const now = Math.floor(Date.now() / 1000);
    const timestamp = receipt.timestamp;

    if (timestamp > now + 300) { // 5 minutes future grace
      throw new Error('Receipt timestamp too far in future');
    }

    if (timestamp < now - 3600) { // 1 hour old
      throw new Error('Receipt timestamp too old');
    }

    // Amount validation
    const usedAmount = parseInt(receipt.usedAmount);
    if (isNaN(usedAmount) || usedAmount <= 0) {
      throw new Error('Invalid used amount');
    }

    // Token count validation
    if (receipt.tokensUsed) {
      const tokensUsed = parseInt(receipt.tokensUsed);
      if (isNaN(tokensUsed) || tokensUsed < 0) {
        throw new Error('Invalid token count');
      }
    }

    return true;
  } catch (error) {
    console.error('Receipt validation failed:', error.message);
    return false;
  }
}

/**
 * Validate cryptographic signature of receipt
 * @param {Object} receipt - Receipt object
 * @param {string} providerPublicKey - Optional provider key override
 * @returns {boolean} True if signature valid
 */
function validateSignature(receipt, providerPublicKey = null) {
  const signature = receipt.signature;

  // Create signature message (exclude signature field)
  const signatureData = {
    intentId: receipt.intentId,
    usedAmount: receipt.usedAmount,
    tokensUsed: receipt.tokensUsed,
    endpointHash: receipt.endpointHash,
    nonce: receipt.nonce,
    timestamp: receipt.timestamp,
    provider: receipt.provider,
    payoutChain: receipt.payoutChain
  };

  // Deterministic stringification for signing
  const message = JSON.stringify(signatureData, Object.keys(signatureData).sort());

  // Assume provider key is available (in production: fetch from registry)
  if (!providerPublicKey) {
    providerPublicKey = providerKeys.get(receipt.provider);
    if (!providerPublicKey) {
      throw new Error(`Unknown provider: ${receipt.provider}`);
    }
  }

  try {
    // Verify signature using ethers (for ECDSA secp256k1)
    const recoveredAddress = ethers.verifyMessage(message, signature);
    const providerAddress = ethers.getAddress(receipt.provider);

    return recoveredAddress.toLowerCase() === providerAddress.toLowerCase();
  } catch (error) {
    console.error('Signature verification failed:', error);
    return false;
  }
}

/**
 * Validate nonce for replay protection
 * @param {string} nonce - Nonce to validate
 * @returns {boolean} True if valid and not replayed
 */
function validateNonce(nonce) {
  // Check if already processed
  if (processedNonces.has(nonce)) {
    return false;
  }

  // Store nonce with timestamp
  const now = Date.now();
  nonceStore.set(nonce, now);
  processedNonces.add(nonce);

  // Cleanup old nonces (prevent memory leak)
  cleanupOldNonces();

  return true;
}

/**
 * Clean up old nonces to prevent memory issues
 */
function cleanupOldNonces() {
  const now = Date.now();
  const cutoff = now - maxNonceAge;

  for (const [nonce, timestamp] of nonceStore.entries()) {
    if (timestamp < cutoff) {
      nonceStore.delete(nonce);
      processedNonces.delete(nonce);
    }
  }
}

/**
 * Create a signed usage receipt for provider to issue
 * @param {Object} receiptData - Receipt data to sign
 * @param {string} privateKey - Provider's private key
 * @returns {Object} Signed receipt
 */
function createSignedReceipt(receiptData, privateKey) {
  const receipt = {
    intentId: receiptData.intentId,
    usedAmount: receiptData.usedAmount,
    tokensUsed: receiptData.tokensUsed || 0,
    endpointHash: receiptData.endpointHash,
    nonce: generateNonce(),
    timestamp: Math.floor(Date.now() / 1000),
    provider: receiptData.provider,
    payoutChain: receiptData.payoutChain || 'ethereum'
  };

  // Sign the receipt
  const signatureData = JSON.stringify(receipt, Object.keys(receipt).sort());
  const wallet = new ethers.Wallet(privateKey);
  receipt.signature = wallet.signMessage(signatureData);

  return receipt;
}

/**
 * Sign receipt data (simplified version for gateway)
 * @param {Object} receiptData - Receipt data to sign
 * @param {string} privateKey - Gateway's private key
 * @returns {string} Signature
 */
function signReceipt(receiptData, privateKey) {
  try {
    const signatureData = JSON.stringify(receiptData, Object.keys(receiptData).sort());
    const wallet = new ethers.Wallet(privateKey);
    return wallet.signMessage(signatureData);
  } catch (error) {
    console.error('Failed to sign receipt:', error);
    throw error;
  }
}

/**
 * Generate unique nonce
 * @returns {string} Unique nonce
 */
function generateNonce() {
  return crypto.randomUUID() + '-' + Date.now();
}

/**
 * Validate endpoint hash for security
 * @param {string} endpointHash - Hash of endpoint + params
 * @param {string} expectedEndpoint - Expected endpoint
 * @returns {boolean} True if matches
 */
function validateEndpointHash(endpointHash, expectedEndpoint) {
  const expectedHash = crypto.createHash('sha256').update(expectedEndpoint).digest('hex');
  const providedHash = endpointHash;

  return expectedHash === providedHash;
}

/**
 * Verify receipt against OpenRouter usage (for AI endpoints)
 * @param {Object} receipt - Provider receipt
 * @param {Object} openRouterUsage - OpenRouter usage metadata
 * @returns {boolean} True if usage matches
 */
function verifyAgainstOpenRouterUsage(receipt, openRouterUsage) {
  if (!receipt.tokensUsed || !openRouterUsage) {
    return true; // Skip if not AI endpoint
  }

  const providerTokens = parseInt(receipt.tokensUsed);
  const openRouterTokens = (openRouterUsage.prompt_tokens || 0) + (openRouterUsage.completion_tokens || 0);

  // Allow small tolerance (5%)
  const tolerance = Math.ceil(openRouterTokens * 0.05);
  const difference = Math.abs(providerTokens - openRouterTokens);

  return difference <= tolerance;
}

/**
 * Create Merkle tree root from receipts for DA anchoring
 * @param {Array} receipts - Array of receipt objects
 * @returns {string} Merkle root hash
 */
function createReceiptsMerkleRoot(receipts) {
  if (!receipts.length) return null;

  // Sort receipts deterministically
  const sortedReceipts = receipts.sort((a, b) => a.intentId.localeCompare(b.intentId));

  // Create leaf hashes
  const leaves = sortedReceipts.map(receipt => {
    const serialized = JSON.stringify(receipt, Object.keys(receipt).sort());
    return crypto.createHash('sha256').update(serialized).digest('hex');
  });

  // Build Merkle tree
  while (leaves.length > 1) {
    const newLeaves = [];
    for (let i = 0; i < leaves.length; i += 2) {
      const left = leaves[i];
      const right = leaves[i + 1] || left; // Duplicate last if odd number
      const combined = left + right;
      newLeaves.push(crypto.createHash('sha256').update(combined).digest('hex'));
    }
    leaves.splice(0, leaves.length, ...newLeaves);
  }

  return leaves[0];
}

/**
 * Verifiable receipt format for disputes
 */
class VerifiableReceipt {
  constructor(receipt) {
    this.data = receipt;
    this.timestamp = receipt.timestamp;
    this.merkleProof = null; // Set when batched
    this.daAnchor = null; // Avail DA anchor ID
  }

  /**
   * Serialize for storage/anchoring
   */
  serialize() {
    return JSON.stringify(this.data, Object.keys(this.data).sort());
  }

  /**
   * Verify against stored proof
   */
  verifyAgainstProof(proof) {
    // Verify Merkle proof
    const leafHash = crypto.createHash('sha256').update(this.serialize()).digest('hex');
    return verifyMerkleProof(leafHash, proof.proof, proof.root);
  }
}

/**
 * Simple Merkle proof verification
 */
function verifyMerkleProof(leafHash, proof, root) {
  let currentHash = leafHash;

  for (const sibling of proof) {
    // Sort based on hash comparison (typical Merkle proof logic)
    const [left, right] = sibling.hash < currentHash ? [sibling.hash, currentHash] : [currentHash, sibling.hash];
    currentHash = crypto.createHash('sha256').update(left + right).digest('hex');
  }

  return currentHash === root;
}

module.exports = {
  generateIntentId,
  validateReceipt,
  validateSignature,
  validateNonce,
  createSignedReceipt,
  signReceipt,
  validateEndpointHash,
  verifyAgainstOpenRouterUsage,
  createReceiptsMerkleRoot,
  VerifiableReceipt,
  cleanupOldNonces
};
