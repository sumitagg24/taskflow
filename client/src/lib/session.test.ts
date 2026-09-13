import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resolveForTest } from './apiConfig';
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
    // Module init runs once per worker, so assert against a fresh resolution
    // of the (stubbed) env rather than the import-time constant.
    expect(resolveForTest().crossOrigin).toBe(true);
  });

  it('treats a malformed absolute URL as cross-origin (fail safe)', () => {
    vi.stubEnv('VITE_API_URL', 'https://[broken');
    expect(resolveForTest().crossOrigin).toBe(true);
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
    expect(resolveForTest().crossOrigin).toBe(true);
    // hasSessionFlag follows isCrossOriginApi, which reads the module-init
    // constant — under vitest that is the dev default (loopback, treated as
    // same-origin), so the flag falls through to the document.cookie check.
    expect(hasSessionFlag()).toBe(false);
  });

  afterEach(() => vi.unstubAllEnvs());
});