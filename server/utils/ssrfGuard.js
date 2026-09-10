'use strict';
/* SSRF guard for user-supplied outbound URLs (AI base URLs, webhooks).
 * Layered defense: syntax check -> DNS resolve -> per-answer IP check.
 * Redirect targets must be re-validated via validateRedirectUrl().
 */
const dns = require('dns').promises;
const net = require('net');

const MAX_URL_LENGTH = 2048;
const DEFAULT_TIMEOUT_MS = 10000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;

const BLOCKED_HOSTNAMES = new Set([
  'metadata.google.internal',
  'metadata.google.internal.',
  'instance-data',
  'instance-data.',
]);
const BLOCKED_SUFFIXES = ['.internal', '.svc.cluster.local'];

function isLoopbackOrPrivateV4(p) {
  const [a, b] = p;
  if (a === 127) return true;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  if (a >= 224 && a <= 239) return true;
  if (a === 0) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 192 && (b === 0 || b === 2)) return true;
  if (a === 203 && b === 0) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  return false;
}

function expandIPv6(ip) {
  try {
    const parts = ip.split('::');
    const head = parts[0] ? parts[0].split(':') : [];
    const tail = parts[1] ? parts[1].split(':') : [];
    if ([...head, ...tail].some((x) => x.includes('.'))) return null;
    const missing = 8 - (head.length + tail.length);
    if (missing < 0) return null;
    if (!ip.includes('::') && head.length !== 8) return null;
    const full = [...head, ...Array(Math.max(missing, 0)).fill('0'), ...tail];
    if (full.length !== 8) return null;
    return full.map((x) => x.padStart(4, '0')).join('');
  } catch { return null; }
}

function isBlockedIp(ip) {
  const family = net.isIP(ip);
  if (family === 4) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
    return isLoopbackOrPrivateV4(parts);
  }
  if (family === 6) {
    const lower = String(ip).toLowerCase();
    if (lower === '::1' || lower === '::') return true;
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isBlockedIp(mapped[1]);
    const expanded = expandIPv6(lower);
    if (!expanded) return true;
    const first = parseInt(expanded.slice(0, 4), 16);
    if ((first & 0xffc0) === 0xfe80) return true;
    if ((first & 0xfe00) === 0xfc00) return true;
    if ((first & 0xff00) === 0xff00) return true;
    if (expanded.startsWith('20010db8')) return true;
    return false;
  }
  return true;
}

function isBlockedHostname(hostname) {
  const h = String(hostname || '').toLowerCase().replace(/\.$/, '');
  if (!h) return true;
  if (BLOCKED_HOSTNAMES.has(h) || BLOCKED_HOSTNAMES.has(`${h}.`)) return true;
  if (BLOCKED_SUFFIXES.some((s) => h === s.slice(1) || h.endsWith(s))) return true;
  if (/^[0-9]+$/.test(h)) return true;
  if (/^0x[0-9a-f]+$/i.test(h)) return true;
  return false;
}

function parseAndCheckSyntax(raw, opts = {}) {
  const allowHttpLoopback = opts.allowHttpLoopback !== false;
  if (typeof raw !== 'string' || raw.length === 0) {
    return { ok: false, reason: 'URL must be a non-empty string' };
  }
  if (raw.length > MAX_URL_LENGTH) {
    return { ok: false, reason: 'URL exceeds maximum length' };
  }
  let u;
  try { u = new URL(raw); } catch { return { ok: false, reason: 'Malformed URL' }; }
  if (u.username || u.password) return { ok: false, reason: 'Credentials in URL' };
  const hostname = u.hostname;
  if (isBlockedHostname(hostname)) return { ok: false, reason: 'Hostname not allowed' };
  const clean = hostname.replace(/^\[|\]$/g, '');
  const httpsOnly = String(process.env.AI_REQUIRE_HTTPS ?? 'true').toLowerCase() !== 'false';
  const devOverride = String(process.env.AI_ALLOW_HTTP ?? '').toLowerCase() === 'true';
  const loopNames = ['localhost', '127.0.0.1', '::1', 'host.docker.internal'];
  const isLoopbackName = loopNames.includes(hostname.toLowerCase());
  // IP literals in private/loopback ranges are rejected — EXCEPT loopback
  // literals over http when explicitly allowed (self-hosted dev endpoints).
  if (net.isIP(clean) && isBlockedIp(clean) && !(u.protocol === 'http:' && allowHttpLoopback && isLoopbackName)) {
    return { ok: false, reason: 'IP address not allowed (private/loopback)' };
  }
  if (u.protocol === 'http:') {
    if (httpsOnly && !devOverride && !(allowHttpLoopback && isLoopbackName)) {
      return { ok: false, reason: 'Remote AI endpoints must use https://' };
    }
    if (!isLoopbackName) return { ok: false, reason: 'http only for loopback' };
  } else if (u.protocol !== 'https:') {
    return { ok: false, reason: 'Only https:// (or loopback http://) allowed' };
  }
  return { ok: true, url: u };
}

async function resolveHostIps(hostname) {
  const clean = String(hostname).replace(/^\[|\]$/g, '');
  if (net.isIP(clean)) return [clean];
  const out = new Set();
  const settled = await Promise.allSettled([dns.resolve4(clean), dns.resolve6(clean)]);
  for (const r of settled) if (r.status === 'fulfilled') for (const ip of r.value) out.add(ip);
  return [...out];
}

async function validateOutboundUrl(raw, opts = {}) {
  const syntax = parseAndCheckSyntax(raw, opts);
  if (!syntax.ok) return syntax;
  const clean = syntax.url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  // Loopback names skip DNS entirely: they are only ever allowed for explicit
  // self-hosted development endpoints, and offline environments have no
  // resolver for them. IP literals were already vetted by syntax validation.
  if (net.isIP(clean) || clean === 'localhost' || clean === 'host.docker.internal') {
    return { ok: true, url: syntax.url, resolvedIps: net.isIP(clean) ? [clean] : ['127.0.0.1'] };
  }
  let ips;
  try { ips = await resolveHostIps(syntax.url.hostname); }
  catch (err) { return { ok: false, reason: `DNS failed (${err.code || 'ENOTFOUND'})` }; }
  if (ips.length === 0) return { ok: false, reason: 'Host did not resolve' };
  for (const ip of ips) {
    if (isBlockedIp(ip)) return { ok: false, reason: 'Host resolves to private/loopback' };
  }
  return { ok: true, url: syntax.url, resolvedIps: ips };
}

async function validateRedirectUrl(raw, opts = {}) {
  return validateOutboundUrl(raw, opts);
}

module.exports = {
  validateOutboundUrl, validateRedirectUrl, parseAndCheckSyntax,
  isBlockedIp, isBlockedHostname,
  MAX_URL_LENGTH, DEFAULT_TIMEOUT_MS, MAX_RESPONSE_BYTES, MAX_REDIRECTS,
};
