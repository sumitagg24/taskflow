import { describe, it, expect, beforeEach } from 'vitest';
import { isEnabled, setFlag, resetFlags } from './flags';

const KEY = 'taskflow:flags';

beforeEach(() => {
  localStorage.clear();
});

describe('flags', () => {
  it('defaults every flag to true with no overrides stored', () => {
    expect(isEnabled('ai')).toBe(true);
    expect(isEnabled('growth')).toBe(true);
    expect(isEnabled('realtime')).toBe(true);
  });

  it('honours an explicit override and keeps the other defaults', () => {
    setFlag('ai', false);
    expect(isEnabled('ai')).toBe(false);
    expect(isEnabled('growth')).toBe(true);
    expect(JSON.parse(localStorage.getItem(KEY) as string)).toEqual({ ai: false });
  });

  it('resetFlags clears overrides back to all-true defaults', () => {
    setFlag('ai', false);
    resetFlags();
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(isEnabled('ai')).toBe(true);
  });

  it('ignores malformed JSON instead of crashing', () => {
    localStorage.setItem(KEY, '{not-json');
    expect(isEnabled('ai')).toBe(true);
  });
});
