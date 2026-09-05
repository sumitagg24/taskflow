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
  const hasCookieAuth = typeof cookieHeader === 'string' && cookieHeader.includes('accessToken=');
  if (!hasCookieAuth) return next();

  // Pure-browser session is the CSRF-relevant case; Bearer fallback (used by
  // native/API clients) is not auto-sent by browsers, so skip the check.
  if (req.headers.authorization) return next();

  const origin = req.headers.origin;
  const referer = req.headers.referer || req.headers.referrer;
  const candidate = origin || (referer ? originFromReferer(referer) : undefined);

  if (!isOriginAllowed(candidate)) {
    return res.status(403).json({ message: 'Cross-origin request forbidden' });
  }
  return next();
}

module.exports = csrfProtection;
