/**
 * QA/staging feature-flag overrides. Defaults are all `true` so production
 * behaviour never changes unless someone explicitly opts out via:
 *
 *   localStorage.setItem('taskflow:flags', JSON.stringify({ ai: false }))
 *
 * Helpers: `setFlag('ai', false)` to override one flag,
 * `resetFlags()` to clear all overrides. Malformed JSON is ignored.
 */

export type FlagName = 'ai' | 'growth' | 'realtime';

const STORAGE_KEY = 'taskflow:flags';

const DEFAULTS: Record<FlagName, boolean> = {
  ai: true,
  growth: true,
  realtime: true,
};

function readOverrides(): Partial<Record<FlagName, boolean>> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    return parsed as Partial<Record<FlagName, boolean>>;
  } catch {
    return {};
  }
}

export function isEnabled(flag: FlagName): boolean {
  const override = readOverrides()[flag];
  return typeof override === 'boolean' ? override : DEFAULTS[flag];
}

export function setFlag(flag: FlagName, value: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readOverrides(), [flag]: value }));
  } catch {
    // storage disabled (private mode) — flags simply stay default.
  }
}

export function resetFlags(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage disabled — nothing to clear.
  }
}
