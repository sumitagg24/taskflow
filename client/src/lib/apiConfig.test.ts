import { describe, it, expect } from 'vitest';
import {
  apiConfig,
  assertApiConfigUsable,
  fromExplicitForTest,
} from './apiConfig';

describe('apiConfig resolution (test-mode defaults)', () => {
  it('resolves dev-default /api + loopback socket under vitest', () => {
    // vitest: DEV=true, so the dev default applies — /api + local socket.
    // jsdom's page origin is also loopback (:3000), so crossOrigin is
    // relaxed to false (see LOOPBACK_HOSTS in apiConfig.ts).
    expect(apiConfig.apiBaseUrl).toBe('/api');
    expect(apiConfig.socketUrl).toBe('http://localhost:5000');
    expect(apiConfig.crossOrigin).toBe(false);
  });

  it('normalises explicit values to a /api base + bare socket origin', () => {
    const r = fromExplicitForTest('https://api.example.com');
    expect(r!.apiBaseUrl).toBe('https://api.example.com/api');
    expect(r!.socketUrl).toBe('https://api.example.com');

    const withPath = fromExplicitForTest('https://api.example.com/api/');
    expect(withPath!.apiBaseUrl).toBe('https://api.example.com/api');
    expect(withPath!.socketUrl).toBe('https://api.example.com');
  });

  it('rejects ambiguous relative values', () => {
    expect(fromExplicitForTest('api')).toBeNull();
    expect(fromExplicitForTest('')).toBeNull();
    expect(fromExplicitForTest(undefined)).toBeNull();
  });

  it('accepts explicit same-origin /api (single-service deploy)', () => {
    const r = fromExplicitForTest('http://localhost:3000/api');
    expect(r!.apiBaseUrl).toBe('http://localhost:3000/api');
    expect(r!.socketUrl).toBe('http://localhost:3000');
  });

  it('assertApiConfigUsable is a no-op outside production builds', () => {
    // import.meta.env.PROD is false under vitest — must never throw here.
    expect(() => assertApiConfigUsable()).not.toThrow();
  });
});
