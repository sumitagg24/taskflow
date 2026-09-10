// CSRF origin check for cookie-authenticated mutations.
//
// Rationale: browsers always send Origin (fetch/XHR) or Referer (form POSTs,
// navigations) on cross-site requests, and same-origin requests match the
// allowlist — so a pure-browser cookie session with a disallowed/mismatched
// origin is a CSRF attempt. Requests with no Origin/Referer (curl, native
// apps, supertest) are allowed since non-browsers aren't CSRF threats.
// Bearer-authed requests bypass the check by design: the token isn't sent
// automatically by the browser, so there is nothing to forge cross-site.
const { isOriginAllowed } = require('../config/cors');

const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function originFromReferer(referer) {
  try {
    return new URL(referer).origin;
  } catch {
    return referer;
  }
}

function csrfProtection(req, res, next) {
  if (!STATE_CHANGING.has(req.method)) return next();

  const cookieHeader = req.headers && req.headers.cookie;
  const hasCookieAuth =
    typeof cookieHeader === 'string' &&
    (cookieHeader.includes('accessToken=') || cookieHeader.includes('__Host-accessToken='));
  if (!hasCookieAuth) return next();

  // Pure-browser session is the CSRF-relevant case; Bearer fallback (used by
  // native/API clients) is not auto-sent by browsers, so skip the check.
  if (req.headers.authorization) return next();

  // ---- Fetch Metadata defense (stronger than Origin/Referer) ----
  // Browsers attach Sec-Fetch-* headers to every request and attackers cannot
  // strip or forge them from cross-site contexts, so when present they take
  // precedence. `cross-site` is always hostile for a cookie-authed mutation.
  // `same-site` (another subdomain of the same registrable domain) is also
  // rejected: our cookies are host-only (no Domain attribute), so no
  // legitimate sibling-subdomain page ever carries them.
  const fetchSite = req.headers['sec-fetch-site'];
  if (typeof fetchSite === 'string') {
    if (fetchSite === 'cross-site' || fetchSite === 'same-site') {
      return res.status(403).json({ message: 'Cross-site request forbidden' });
    }
    // 'same-origin' and 'none' pass through to normal handling.
  }

  const origin = req.headers.origin;
  const referer = req.headers.referer || req.headers.referrer;
  const candidate = origin || (referer ? originFromReferer(referer) : undefined);

  if (!isOriginAllowed(candidate)) {
    return res.status(403).json({ message: 'Cross-origin request forbidden' });
  }
  return next();
}

module.exports = csrfProtection;
