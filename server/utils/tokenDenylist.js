const crypto = require('crypto');

// In-memory denylist of logged-out access tokens, keyed by sha256 hex of
// the raw token (raw tokens are NEVER stored). Values are expiry epoch-ms;
// entries are kept only until the token would have expired naturally (~15m),
// so the map stays bounded. Single-process deploy is the documented norm,
// making an in-memory store acceptable here.
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

const denied = new Map();
let sweepTimer = null;

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

function startSweep() {
  if (sweepTimer || typeof setInterval !== 'function') return;
  sweepTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, expMs] of denied) {
      if (expMs <= now) denied.delete(key);
    }
  }, SWEEP_INTERVAL_MS);
  if (sweepTimer && typeof sweepTimer.unref === 'function') sweepTimer.unref();
}

function add(token, expMs) {
  if (!token || !Number.isFinite(expMs)) return;
  if (expMs <= Date.now()) return;
  denied.set(hashToken(token), expMs);
  startSweep();
}

function has(token) {
  if (!token) return false;
  const expMs = denied.get(hashToken(token));
  if (expMs === undefined) return false;
  if (expMs <= Date.now()) {
    denied.delete(hashToken(token));
    return false;
  }
  return true;
}

function size() {
  return denied.size;
}

function _reset() {
  denied.clear();
  if (sweepTimer) {
    clearInterval(sweepTimer);
    sweepTimer = null;
  }
}

module.exports = { add, has, size, _reset };
