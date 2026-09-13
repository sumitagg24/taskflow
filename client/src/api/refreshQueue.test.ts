import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';

// Shared state lives in vi.hoisted because vi.mock factories are hoisted
// above all imports. The axios mock returns ONE stable instance (the one
// tasks.ts closes over as `api`) and captures its 401 rejection handler so
// tests can drive the refresh queue directly.
const h = vi.hoisted(() => {
  return { onRejected: null as any, instance: null as any };
});

vi.mock('axios', async (importOriginal) => {
  const actual = await importOriginal<typeof import('axios')>();
  // Axios instances are CALLABLE functions with .get/.post/etc attached —
  // tasks.ts retries via `api(originalRequest)` (a direct call), so the mock
  // must be callable too.
  const instance: any = Object.assign(
    vi.fn().mockResolvedValue({ data: { tasks: [] } }),
    {
      get: vi.fn().mockResolvedValue({ data: { tasks: [] } }),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      patch: vi.fn(),
      defaults: { headers: { common: {} } },
      interceptors: {
        request: { use: vi.fn() },
        response: {
          use: (_ok: any, fail: any) => {
            h.onRejected = fail;
          },
        },
      },
    }
  );
  h.instance = instance;
  // `default.post` is the BARE axios the refresh queue uses (deliberately not
  // the `api` instance) — mock it separately so refresh calls are observable.
  const mockedDefault = Object.assign({}, actual, {
    create: vi.fn(() => instance),
    post: vi.fn().mockResolvedValue({ status: 200, data: {} }),
  }) as any;
  return { ...actual, default: mockedDefault };
});

const handler = () => h.onRejected as (error: any) => Promise<any>;
const refreshPost = () => (axios as any).post as ReturnType<typeof vi.fn>;

const expired = () => ({
  config: { _retry: false, headers: {} },
  response: { status: 401, data: { code: 'TOKEN_EXPIRED' } },
});

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  window.dispatchEvent(new Event('taskflow:session-expired')); // no-op if nobody listens
});

describe('401 refresh single-flight queue', () => {
  it('fires exactly one refresh for N concurrent TOKEN_EXPIRED 401s and retries all callers', async () => {
    await import('./tasks'); // module init registers the interceptor once
    const run = handler();
    expect(run).toBeTypeOf('function');

    const p1 = run(expired()).catch(() => 'rejected');
    const p2 = run(expired()).catch(() => 'rejected');
    const p3 = run(expired()).catch(() => 'rejected');
    const results = await Promise.all([p1, p2, p3]);

    // Single-flight: exactly one bare-axios refresh for three concurrent 401s.
    expect(refreshPost()).toHaveBeenCalledTimes(1);
    expect(refreshPost().mock.calls[0][0]).toContain('/auth/refresh-token');
    // Every caller got the retried response, not a rejection.
    expect(results).not.toContain('rejected');
  });

  it('rejects the whole queue and dispatches session-expired exactly once when refresh fails', async () => {
    await import('./tasks');
    refreshPost().mockRejectedValueOnce(new Error('refresh rejected'));
    const listener = vi.fn();
    window.addEventListener('taskflow:session-expired', listener);

    const p1 = handler()(expired()).catch(() => 'rejected');
    const p2 = handler()(expired()).catch(() => 'rejected');
    await Promise.all([p1, p2]);

    expect(refreshPost()).toHaveBeenCalledTimes(1);
    // AuthContext listens for this to clear state and route to sign-in —
    // one burst, one event, no full-page reload anywhere.
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener('taskflow:session-expired', listener);
  });

  it('never refreshes for 401s without the TOKEN_EXPIRED code', async () => {
    await import('./tasks');
    const plain401 = { config: { _retry: false, headers: {} }, response: { status: 401, data: {} } };
    await expect(handler()(plain401)).rejects.toBeTruthy();
    expect(refreshPost()).not.toHaveBeenCalled();
  });

  it('does not loop: a retried request that 401s again rejects without a second refresh', async () => {
    await import('./tasks');
    // The retried request goes through `api(originalRequest)` — a direct
    // CALL of the instance — so make the callable mock itself 401 once. The
    // config already carries `_retry: true`, so the handler must reject that
    // second failure without refreshing again (no interceptor loop).
    h.instance.mockRejectedValueOnce(expired());
    await expect(handler()(expired())).rejects.toBeTruthy();
    // refresh happened once for the original failure; the second 401 (on the
    // retry path) must NOT trigger another.
    expect(refreshPost()).toHaveBeenCalledTimes(1);
  });
});
