/**
 * Shared session-detection helpers (same-origin and cross-origin deploys).
 *
 * Same-origin deploy (default, single-service): the server writes a
 * readable `tf_session` cookie next to the httpOnly access/refresh pair, so
 * the SPA can decide to skip the boot profile fetch entirely — zero requests,
 * straight to login on fresh visits.
 *
 * Cross-origin deploy (e.g. Vercel SPA in front of a remote API): the SPA's
 * `document.cookie` can never see the API domain's cookies, so the readable
 * flag is invisible from this origin no matter what. The only reliable signal
 * is the server's answer to `GET /auth/profile`, so `hasSessionFlag()` returns
 * `true` in this mode and the boot fetch always runs — the httpOnly cookies
 * (SameSite=None; Secure) ride along and the server decides.
 */

import { apiConfig } from './apiConfig';

export function isCrossOriginApi(): boolean {
  // Single config source (apiConfig.ts) so this check can never drift from
  // the axios/socket clients.
  return apiConfig.crossOrigin;
}

export function hasSessionFlag(): boolean {
  try {
    // Cookie scoping hides the API domain's cookies from this origin — only
    // the server can tell. Bailing out to the boot profile fetch is correct.
    if (isCrossOriginApi()) return true;
    if (typeof document === 'undefined' || !document.cookie) return false;
    return document.cookie.split(';').some((part) => part.trim() === 'tf_session=1');
  } catch {
    return false;
  }
}