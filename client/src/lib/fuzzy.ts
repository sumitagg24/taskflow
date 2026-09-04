/**
 * Subsequence fuzzy matcher with span highlighting — the same shape editors use
 * for file pickers. Scoring rewards prefix hits, word-boundary hits and runs of
 * consecutive characters so "wkrp" ranks "Weekly Report" above "Work Pipeline".
 */
export interface FuzzyResult {
  score: number;
  /** Index ranges of the haystack that matched, for <mark> rendering. */
  ranges: [number, number][];
}

const WORD_BOUNDARY = /[\s\-_/.:,()[\]]/;

export function fuzzyMatch(query: string, text: string): FuzzyResult | null {
  if (!query) return { score: 0, ranges: [] };
  if (!text) return null;

  const q = query.toLowerCase();
  const t = text.toLowerCase();

  // Exact substring is always the best match; short-circuit and score it high.
  const direct = t.indexOf(q);
  if (direct !== -1) {
    const atStart = direct === 0;
    const atBoundary = direct > 0 && WORD_BOUNDARY.test(t[direct - 1]);
    return {
      score: 1000 + (atStart ? 400 : atBoundary ? 250 : 0) + q.length * 8 - direct,
      ranges: [[direct, direct + q.length]],
    };
  }

  let score = 0;
  let ti = 0;
  let lastMatch = -2;
  const ranges: [number, number][] = [];

  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi];
    let found = -1;
    for (let i = ti; i < t.length; i++) {
      if (t[i] === ch) {
        found = i;
        break;
      }
    }
    if (found === -1) return null;

    if (found === lastMatch + 1) {
      score += 18; // consecutive run
      const last = ranges[ranges.length - 1];
      if (last) last[1] = found + 1;
      else ranges.push([found, found + 1]);
    } else {
      if (found === 0) score += 30;
      else if (WORD_BOUNDARY.test(t[found - 1])) score += 22;
      else score += 4;
      score -= Math.min(found - ti, 12); // gap penalty, bounded
      ranges.push([found, found + 1]);
    }

    lastMatch = found;
    ti = found + 1;
  }

  // Prefer shorter haystacks when scores tie.
  return { score: score + Math.max(0, 24 - text.length / 4), ranges };
}

/** Sorts candidates by fuzzy score against `query`, dropping non-matches. */
export function fuzzyFilter<T>(
  items: T[],
  query: string,
  keyOf: (item: T) => string,
  limit = 50
): { item: T; result: FuzzyResult }[] {
  if (!query.trim()) {
    return items.slice(0, limit).map((item) => ({ item, result: { score: 0, ranges: [] } }));
  }

  const scored: { item: T; result: FuzzyResult }[] = [];
  for (const item of items) {
    const result = fuzzyMatch(query, keyOf(item));
    if (result) scored.push({ item, result });
  }
  scored.sort((a, b) => b.result.score - a.result.score);
  return scored.slice(0, limit);
}

/** Splits `text` into matched/unmatched chunks for highlight rendering. */
export function highlightChunks(
  text: string,
  ranges: [number, number][]
): { text: string; match: boolean }[] {
  if (ranges.length === 0) return [{ text, match: false }];

  const chunks: { text: string; match: boolean }[] = [];
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start > cursor) chunks.push({ text: text.slice(cursor, start), match: false });
    chunks.push({ text: text.slice(start, end), match: true });
    cursor = end;
  }
  if (cursor < text.length) chunks.push({ text: text.slice(cursor), match: false });
  return chunks;
}
