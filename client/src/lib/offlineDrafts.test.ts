import { describe, it, expect, beforeEach } from 'vitest';
import { readDrafts, addDraft, removeDrafts } from '@/lib/offlineDrafts';

beforeEach(() => {
  localStorage.clear();
});

describe('offlineDrafts', () => {
  it('starts empty and round-trips a draft', () => {
    expect(readDrafts()).toEqual([]);
    const d = addDraft('  Offline thought  ');
    expect(d.title).toBe('Offline thought');
    expect(readDrafts()).toHaveLength(1);
  });

  it('removes flushed drafts only', () => {
    const a = addDraft('A');
    addDraft('B');
    removeDrafts([a.id]);
    expect(readDrafts().map((d) => d.title)).toEqual(['B']);
  });

  it('ignores corrupt storage instead of throwing', () => {
    localStorage.setItem('taskflow:offline-drafts', 'not-json{');
    expect(readDrafts()).toEqual([]);
  });
});
