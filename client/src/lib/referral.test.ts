import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { captureReferralCode, getReferralCode, clearReferralCode } from './referral';

const STORAGE_KEY = 'taskflow:referral';

/** jsdom lets us rewrite the URL, which is what `captureReferralCode` reads. */
const setUrl = (search: string) => {
  window.history.replaceState({}, '', `/${search}`);
};

describe('referral code capture', () => {
  beforeEach(() => {
    localStorage.clear();
    setUrl('');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('banks a valid code from the query string', () => {
    setUrl('?ref=ABCD2345');
    expect(captureReferralCode()).toBe('ABCD2345');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('ABCD2345');
  });

  it('upper-cases a lowercase code', () => {
    setUrl('?ref=abcd2345');
    expect(captureReferralCode()).toBe('ABCD2345');
  });

  it('strips ref from the URL but keeps other params', () => {
    setUrl('?ref=ABCD2345&utm_source=email');
    captureReferralCode();
    expect(window.location.search).toBe('?utm_source=email');
  });

  it('leaves no query string behind when ref was the only param', () => {
    setUrl('?ref=ABCD2345');
    captureReferralCode();
    expect(window.location.search).toBe('');
  });

  it('ignores a malformed code and still strips the param', () => {
    setUrl('?ref=<script>alert(1)</script>');
    expect(captureReferralCode()).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(window.location.search).toBe('');
  });

  it('ignores a code that is too short', () => {
    setUrl('?ref=AB');
    expect(captureReferralCode()).toBeNull();
  });

  it('keeps a previously banked code when the URL has no ref', () => {
    localStorage.setItem(STORAGE_KEY, 'KEEP1234');
    expect(captureReferralCode()).toBe('KEEP1234');
  });

  it('a later valid code replaces the banked one', () => {
    localStorage.setItem(STORAGE_KEY, 'OLD12345');
    setUrl('?ref=NEW12345');
    expect(captureReferralCode()).toBe('NEW12345');
  });

  it('does not surface a corrupt stored value', () => {
    localStorage.setItem(STORAGE_KEY, 'not a code!!');
    expect(getReferralCode()).toBeNull();
  });

  it('clears the banked code', () => {
    localStorage.setItem(STORAGE_KEY, 'ABCD2345');
    clearReferralCode();
    expect(getReferralCode()).toBeNull();
  });

  it('survives localStorage being unavailable', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceeded');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    setUrl('?ref=ABCD2345');
    expect(() => captureReferralCode()).not.toThrow();
    expect(captureReferralCode()).toBeNull();
  });
});
