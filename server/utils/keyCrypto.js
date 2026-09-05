'use strict';

// AES-256-GCM encryption for per-user AI provider keys at rest.
//
// Stored shape: `enc:v1:<ivHex>:<tagHex>:<ctHex>` (iv 12 bytes, tag 16 bytes).
// Anything without the `enc:v1:` prefix is treated as a pre-migration
// plaintext key and returned as-is (legacy passthrough — no writes on read;
// the value is re-encrypted on the next settings write).
//
// Key source: `AI_KEY_SECRET` env — either a 64-hex-char string (used as raw
// 32 bytes) or any string >= 32 chars (sha256'd down to 32 bytes).
// Production with no valid key THROWS, but only when encrypt/decrypt is first
// NEEDED (lazy, never at boot) so keyless deploys keep running until somebody
// actually stores or reads a key. Non-production falls back to a dev-only
// constant (warned once) so local/test never break.

const crypto = require('crypto');
const logger = require('./logger');

const PREFIX = 'enc:v1:';
const DEV_FALLBACK_SECRET = 'dev-only-ai-key-secret-not-for-production-0123456789';

let warnedOnce = false;

function resolveKey() {
  const raw = process.env.AI_KEY_SECRET;
  if (typeof raw === 'string' && raw.length > 0) {
    if (/^[0-9a-fA-F]{64}$/.test(raw)) {
      return Buffer.from(raw, 'hex');
    }
    if (raw.length >= 32) {
      return crypto.createHash('sha256').update(raw, 'utf8').digest();
    }
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'AI_KEY_SECRET is not configured: set it to a 64-hex-char string or any string of at least 32 characters to store or read AI provider keys.'
    );
  }
  if (!warnedOnce) {
    warnedOnce = true;
    logger.warn(
      'AI_KEY_SECRET is not set — using a dev-only fallback to encrypt AI keys. Set AI_KEY_SECRET in production.'
    );
  }
  return crypto.createHash('sha256').update(DEV_FALLBACK_SECRET, 'utf8').digest();
}

function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

function encrypt(plaintext) {
  if (plaintext === undefined || plaintext === null || plaintext === '') {
    return plaintext == null ? '' : plaintext;
  }
  const text = String(plaintext);
  // Already encrypted (e.g. a retried write) — keep idempotent, don't nest.
  if (isEncrypted(text)) return text;
  const key = resolveKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('hex')}:${tag.toString('hex')}:${ct.toString('hex')}`;
}

function decrypt(stored) {
  if (!stored) return stored || '';
  if (typeof stored !== 'string') return stored;
  // Pre-migration plaintext — needs no key, returned as-is.
  if (!isEncrypted(stored)) return stored;
  const key = resolveKey();
  const parts = stored.slice(PREFIX.length).split(':');
  if (parts.length !== 3) {
    throw new Error('Stored AI key has an invalid encrypted format.');
  }
  const [ivHex, tagHex, ctHex] = parts;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return Buffer.concat([
      decipher.update(Buffer.from(ctHex, 'hex')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new Error('Failed to decrypt the stored AI key (wrong AI_KEY_SECRET or corrupted data).');
  }
}

module.exports = { encrypt, decrypt, isEncrypted, PREFIX };
