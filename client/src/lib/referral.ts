const STORAGE_KEY = 'taskflow:referral';
const CODE_RE = /^[A-Z0-9]{4,16}$/;

/**
 * Referral codes arrive as `?ref=CODE` on the marketing/invite link. Signup can
 * be several navigations away (mode switch, refresh, email verification), so the
 * code is captured once into localStorage and the query param is stripped —
 * leaving it in the URL means it survives into shared links and analytics.
 */
export function captureReferralCode(): string | null {
  if (typeof window === 'undefined') return null;

  try {
    const params = new URLSearchParams(window.location.search);
    const incoming = (params.get('ref') || '').trim().toUpperCase();

    if (CODE_RE.test(incoming)) {
      localStorage.setItem(STORAGE_KEY, incoming);
    }

    if (params.has('ref')) {
      params.delete('ref');
      const qs = params.toString();
      window.history.replaceState(
        {},
        '',
        `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`
      );
    }
  } catch {
    // Private-mode localStorage or an exotic URL: attribution is best-effort.
  }

  return getReferralCode();
}

export function getReferralCode(): string | null {
  try {
    const stored = (localStorage.getItem(STORAGE_KEY) || '').trim().toUpperCase();
    return CODE_RE.test(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function clearReferralCode(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to clear */
  }
}
