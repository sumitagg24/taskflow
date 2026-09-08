import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { isCrossOriginApi, hasSessionFlag } from './session';

const clearFlagCookie = () => {
  document.cookie = 'tf_session=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
};

describe('isCrossOriginApi', () => {
  beforeEach(() => clearFlagCookie());

  it('is false when VITE_API_URL is not set (same-origin default)', () => {
    vi.stubEnv('VITE_API_URL', '');
    expect(isCrossOriginApi()).toBe(false);
  });

  it('is false for the same origin or a relative /api path', () => {
    vi.stubEnv('VITE_API_URL', '/api');
    expect(isCrossOriginApi()).toBe(false);
    vi.stubEnv('VITE_API_URL', window.location.origin + '/api');
    expect(isCrossOriginApi()).toBe(false);
  });

  it('is true for an absolute URL on a different origin', () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.com/api');
    expect(isCrossOriginApi()).toBe(true);
  });

  it('treats a malformed absolute URL as cross-origin (fail safe)', () => {
    vi.stubEnv('VITE_API_URL', 'https://[broken');
    expect(isCrossOriginApi()).toBe(true);
  });

  afterEach(() => vi.unstubAllEnvs());
});

describe('hasSessionFlag', () => {
  beforeEach(() => clearFlagCookie());

  it('returns false same-origin with no session flag', () => {
    vi.stubEnv('VITE_API_URL', '');
    expect(hasSessionFlag()).toBe(false);
  });

  it('returns true same-origin when the readable flag is present', () => {
    vi.stubEnv('VITE_API_URL', '');
    document.cookie = 'tf_session=1';
    expect(hasSessionFlag()).toBe(true);
  });

  it('always returns true cross-origin — only the server can decide', () => {
    // The API domain's cookies are invisible here, so the SPA must ask the
    // server via the boot profile fetch instead of trusting document.cookie.
    vi.stubEnv('VITE_API_URL', 'https://api.example.com/api');
    expect(hasSessionFlag()).toBe(true);
  });

  afterEach(() => vi.unstubAllEnvs());
});