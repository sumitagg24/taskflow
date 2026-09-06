import { useEffect, useState } from 'react';

/** Tailwind `md:` breakpoint boundary, shared so phone behavior stays in sync. */
export const PHONE_QUERY = '(max-width: 767px)';

function matchesQuery(query: string): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(query).matches
  );
}

/**
 * Reactive media-query hook (jsdom-safe: returns false when matchMedia is
 * unavailable). Re-renders only when the match state actually flips.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => matchesQuery(query));

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/** True on phone widths; drives bottom-sheet placement and agenda defaults. */
export function useIsPhone(): boolean {
  return useMediaQuery(PHONE_QUERY);
}
