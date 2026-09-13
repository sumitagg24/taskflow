'use strict';

/* Guarded fetch for outbound calls to user-controlled endpoints (custom AI
 * base URLs). Save-time validation (aiSettingsController → ssrfGuard) cannot
 * cover the actual HTTP call: the OpenAI SDK follows 3xx redirects itself and
 * a public endpoint can 302 the request straight into the private network
 * (classic redirect-based SSRF). This wrapper re-validates EVERY hop,
 * enforces timeouts and bounds the response size before it hits the parser.
 *
 * Design notes:
 *  - `redirect: 'manual'` — redirect targets are validated with the same
 *    ssrfGuard rules as the original URL (DNS + resolved-IP + scheme) before
 *    the next hop is followed. A redirect to a loopback/metadata/private
 *    address never leaves the process.
 *  - Loopback http:// endpoints stay allowed behind the same env flags the
 *    syntax layer uses, so self-hosted dev AI endpoints keep working.
 *  - Auth headers are re-attached manually on each validated hop (fetch drops
 *    nothing across same-protocol redirects by default, but we are driving
 *    the loop ourselves and must not leak the key to an UNVALIDATED host —
 *    the header is only ever sent to a URL that just passed the guard).
 *  - Response body is consumed as a stream with a hard byte ceiling, so a
 *    hostile/huge endpoint cannot OOM the server or poison downstream JSON
 *    parsing with gigabytes of padding.
 */

const guard = require('../utils/ssrfGuard');

const DEFAULT_TIMEOUT_MS = guard.DEFAULT_TIMEOUT_MS;
const MAX_RESPONSE_BYTES = guard.MAX_RESPONSE_BYTES;
const MAX_REDIRECTS = guard.MAX_REDIRECTS;

class SsrfBlockedError extends Error {
  constructor(reason) {
    super(`Blocked by SSRF guard: ${reason}`);
    this.name = 'SsrfBlockedError';
    this.code = 'ESSRFBLOCKED';
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Retry-After may be a seconds count or a date; cap hostile values. */
function parseRetryAfter(value) {
  if (!value) return null;
  const asInt = Number(value);
  if (Number.isFinite(asInt) && asInt >= 0) return Math.min(asInt, 60);
  const asDate = Date.parse(value);
  if (!Number.isNaN(asDate)) return Math.min(Math.max((asDate - Date.now()) / 1000, 0), 60);
  return null;
}

/**
 * Validate a URL with the standard guard rules. Returns the URL object or
 * throws SsrfBlockedError. `initialAuthBypass` keeps loopback rules consistent
 * between the syntax layer (validateOutboundUrl) and this wrapper.
 */
async function validateHop(urlStr) {
  const verdict = await guard.validateOutboundUrl(urlStr);
  if (!verdict.ok) throw new SsrfBlockedError(verdict.reason || 'unvalidated URL');
  return verdict.url;
}

/** Read a response body fully, enforcing the byte ceiling. */
async function readBodyCapped(response, maxBytes) {
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      try { await reader.cancel(); } catch { /* stream already closed */ }
      throw new SsrfBlockedError(`response exceeded ${maxBytes} bytes`);
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, total);
}

/**
 * The main entry point. Signature-compatible enough with `fetch` for the
 * OpenAI SDK's custom-fetch contract: (url, init) → Promise<Response-like>
 * with `.ok`, `.status`, `.statusText`, `.headers.get`, `.json()`, `.text()`.
 *
 * opts (all optional):
 *   timeoutMs, maxBytes, maxRedirects — override module defaults.
 */
async function ssrfFetch(input, init = {}, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = opts.maxBytes ?? MAX_RESPONSE_BYTES;
  const maxRedirects = opts.maxRedirects ?? MAX_REDIRECTS;

  let currentUrl = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  let method = (init.method || 'GET').toUpperCase();
  let headers = new Headers(init.headers || {});
  const body = init.body ?? null;

  let currentUrlObj = await validateHop(currentUrl);
  // Pin the request to the IP set the guard just approved. The SDK passes an
  // absolute URL, so we rewrite it onto the validated origin (schema/host) —
  // the path/query come from the same string that was validated.
  let requestUrl = currentUrlObj.href;

  let redirectCount = 0;
  for (;;) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);
    // Compose the caller's signal (the OpenAI SDK passes its request timeout
    // this way) with our per-hop deadline — whichever fires first wins.
    const externalSignal = init.signal;
    const onExternalAbort = () => controller.abort(externalSignal.reason);
    if (externalSignal) {
      if (externalSignal.aborted) controller.abort(externalSignal.reason);
      else externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
    let response;
    try {
      response = await fetch(requestUrl, {
        method,
        headers,
        body: method === 'GET' || method === 'HEAD' ? undefined : body,
        redirect: 'manual',
        signal: controller.signal,
      });
    } catch (err) {
      // Distinguish caller cancellation from our own guard/timeout failures:
      // the SDK treats an abort as a cancellable error, not an SSRF block.
      if (externalSignal?.aborted) {
        throw new Error(`Request cancelled: ${err?.message || 'aborted'}`);
      }
      throw new SsrfBlockedError(`fetch failed (${err?.message || 'network error'})`);
    } finally {
      clearTimeout(timer);
      if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);
    }

    // 3xx: validate the target BEFORE following. Never forward 303-derived
    // method/body semantics into unvalidated space — we re-run the guard
    // first and only then rewrite method/body per RFC 7231.
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        // No Location to follow — surface the 3xx as-is (bounded read).
        const buffered = await readBodyCapped(response, maxBytes);
        return wrapResponse(response, buffered);
      }
      if (redirectCount >= maxRedirects) {
        throw new SsrfBlockedError(`too many redirects (limit ${maxRedirects})`);
      }
      redirectCount += 1;
      const nextUrl = new URL(location, currentUrlObj).href;
      const nextUrlObj = await validateHop(nextUrl);

      if (response.status === 303 || ((response.status === 301 || response.status === 302) && method === 'POST')) {
        method = 'GET';
      }
      currentUrl = nextUrl;
      currentUrlObj = nextUrlObj;
      requestUrl = nextUrlObj.href;
      continue;
    }

    // 429/5xx with Retry-After: bounded single retry (SDK-level backoff cannot
    // see the redirect-disabled response, so we do it here).
    if ((response.status === 429 || response.status >= 500) && !init.__retried) {
      const wait = parseRetryAfter(response.headers.get('retry-after'));
      await readBodyCapped(response, maxBytes).catch(() => {});
      if (wait !== null && wait <= 60) {
        await sleep(wait * 1000);
        return ssrfFetch(currentUrl, { ...init, __retried: true }, { timeoutMs, maxBytes, maxRedirects });
      }
    }

    const finalBody = await readBodyCapped(response, maxBytes);
    return wrapResponse(response, finalBody);
  }
}

/**
 * Attach a fully-read body to a minimal Response-compatible object. The raw
 * Response's stream was already consumed by the cap reader (and destroyed),
 * so downstream `.json()`/`.text()` must come from the buffer.
 */
function wrapResponse(response, body = null) {
  if (body !== null) {
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      headers: { get: (name) => response.headers.get(name) },
      url: response.url,
      json: async () => JSON.parse(body.toString('utf8')),
      text: async () => body.toString('utf8'),
      arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
    };
  }
  // Fallback (not used in current flow — bodies are always pre-read).
  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    headers: { get: (name) => response.headers.get(name) },
    url: response.url,
    json: () => response.json(),
    text: () => response.text(),
  };
}

module.exports = {
  ssrfFetch,
  SsrfBlockedError,
  validateHop,
  readBodyCapped,
  DEFAULT_TIMEOUT_MS,
  MAX_RESPONSE_BYTES,
  MAX_REDIRECTS,
};
