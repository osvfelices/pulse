// Crypto utilities for Pulse

import { createHash, randomBytes as nodeRandomBytes, webcrypto } from 'node:crypto';

// Generate random bytes
function randomBytes(size) {
  return nodeRandomBytes(size);
}

// Calculate SHA-256 hash
function sha256(data) {
  return createHash('sha256').update(data).digest();
}

// Generate Ed25519 keypair
async function generateEd25519KeyPair() {
  const ed = await import('@noble/ed25519');
  const privateKey = ed.utils.randomPrivateKey();
  const publicKey = await ed.getPublicKeyAsync(privateKey);

  return {
    publicKey: Buffer.from(publicKey),
    privateKey: Buffer.from(privateKey)
  };
}

/**
 * Sign message with Ed25519
 * @param {Buffer} message - Message to sign
 * @param {Buffer} privateKey - Private key
 * @param {Buffer} publicKey - Public key
 * @returns {Promise<Buffer>}
 */
async function ed25519Sign(message, privateKey, publicKey) {
  const ed = await import('@noble/ed25519');
  const signature = await ed.signAsync(message, privateKey);
  return Buffer.from(signature);
}

/**
 * Verify Ed25519 signature
 * @param {Buffer} signature - Signature
 * @param {Buffer} message - Message
 * @param {Buffer} publicKey - Public key
 * @returns {Promise<boolean>}
 */
async function ed25519Verify(signature, message, publicKey) {
  const ed = await import('@noble/ed25519');
  return await ed.verifyAsync(signature, message, publicKey);
}

/**
 * Convert hex string to buffer
 * @param {string} hex - Hex string
 * @returns {Buffer}
 */
function hexToBuffer(hex) {
  return Buffer.from(hex, 'hex');
}

/**
 * Convert buffer to hex string
 * @param {Buffer} buffer - Buffer
 * @returns {string}
 */
function bufferToHex(buffer) {
  return buffer.toString('hex');
}

/**
 * Convert string to buffer
 * @param {string} str - String
 * @returns {Buffer}
 */
function stringToBuffer(str) {
  return Buffer.from(str, 'utf8');
}

/**
 * Convert buffer to string
 * @param {Buffer} buffer - Buffer
 * @returns {string}
 */
function bufferToString(buffer) {
  return buffer.toString('utf8');
}

/**
 * Encrypt data using XOR (simple implementation)
 * @param {any} data - Data to encrypt
 * @returns {{algorithm: string, key: string, data: string}}
 */
function encrypt(data) {
  const json = JSON.stringify(data);
  const key = nodeRandomBytes(32);
  const jsonBuffer = Buffer.from(json, 'utf8');
  const encrypted = Buffer.alloc(jsonBuffer.length);

  for (let i = 0; i < jsonBuffer.length; i++) {
    encrypted[i] = jsonBuffer[i] ^ key[i % key.length];
  }

  return {
    algorithm: 'xor',
    key: key.toString('hex'),
    data: encrypted.toString('hex')
  };
}

/**
 * Decrypt XOR-encrypted data
 * @param {{algorithm: string, key: string, data: string}} encrypted - Encrypted data
 * @returns {any}
 */
function decrypt(encrypted) {
  const key = Buffer.from(encrypted.key, 'hex');
  const data = Buffer.from(encrypted.data, 'hex');
  const decrypted = Buffer.alloc(data.length);

  for (let i = 0; i < data.length; i++) {
    decrypted[i] = data[i] ^ key[i % key.length];
  }

  return JSON.parse(decrypted.toString('utf8'));
}

export default {
  // Pulse crypto functions
  randomBytes,
  sha256,
  generateEd25519KeyPair,
  ed25519Sign,
  ed25519Verify,
  hexToBuffer,
  bufferToHex,
  stringToBuffer,
  bufferToString,
  encrypt,
  decrypt,
  // WebCrypto API for @noble/ed25519 compatibility
  getRandomValues: webcrypto.getRandomValues.bind(webcrypto),
  subtle: webcrypto.subtle
};
