// Pure unit tests for the error-telemetry adapter.
// No HTTP, no Sentry install: the Sentry path is exercised through the
// missing-module branch (dynamic require in try/catch).
jest.mock('../utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

const { reportError, redact } = require('../utils/errorTelemetry');
const logger = require('../utils/logger');

describe('errorTelemetry.redact', () => {
  it('redacts sensitive keys recursively and preserves the rest', () => {
    const input = {
      username: 'ada',
      password: 'hunter2',
      nested: { apiKey: 'abc', deep: { authorization: 'Bearer x', keep: 1 } },
      items: [{ refreshToken: 'r', id: 't1' }],
      tokens: ['opaque-list'],
      cookie: 'session=xyz',
      secretAnswer: 'blue',
    };
    const out = redact(input);
    expect(out.username).toBe('ada');
    expect(out.password).toBe('[REDACTED]');
    expect(out.nested.apiKey).toBe('[REDACTED]');
    expect(out.nested.deep.authorization).toBe('[REDACTED]');
    expect(out.nested.deep.keep).toBe(1);
    expect(out.items).toEqual([{ refreshToken: '[REDACTED]', id: 't1' }]);
    // A sensitive key redacts its whole value, not just its children.
    expect(out.tokens).toBe('[REDACTED]');
    expect(out.cookie).toBe('[REDACTED]');
    expect(out.secretAnswer).toBe('[REDACTED]');
    // Never mutates the caller's object.
    expect(input.password).toBe('hunter2');
  });

  it('matches keys case-insensitively across separator styles', () => {
    const out = redact({ Password: 'a', API_KEY: 'b', 'set-cookie': 'c', AccessToken: 'd' });
    expect(out).toEqual({
      Password: '[REDACTED]',
      API_KEY: '[REDACTED]',
      'set-cookie': '[REDACTED]',
      AccessToken: '[REDACTED]',
    });
  });

  it('leaves primitives and arrays of primitives alone', () => {
    expect(redact(null)).toBeNull();
    expect(redact(42)).toBe(42);
    expect(redact('ok')).toBe('ok');
    expect(redact([1, 'a', null])).toEqual([1, 'a', null]);
  });
});

describe('errorTelemetry.reportError', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...OLD_ENV };
    delete process.env.SENTRY_DSN;
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('forwards a redacted payload to the logger with no DSN set (no-op for Sentry)', () => {
    const result = reportError(new Error('boom'), {
      requestId: 'r1',
      password: 'hunter2',
      nested: { token: 't' },
    });
    expect(result).toEqual({ reported: false, reason: 'no-dsn' });
    expect(logger.error).toHaveBeenCalledTimes(1);
    const [message, payload] = logger.error.mock.calls[0];
    expect(message).toContain('boom');
    expect(payload.context.requestId).toBe('r1');
    expect(payload.context.password).toBe('[REDACTED]');
    expect(payload.context.nested.token).toBe('[REDACTED]');
  });

  it('does not crash with a malformed DSN when Sentry is not installed', () => {
    process.env.SENTRY_DSN = 'not-a-valid-dsn';
    let result;
    expect(() => {
      result = reportError(new Error('boom'), { requestId: 'r2' });
    }).not.toThrow();
    expect(result).toEqual({ reported: false, reason: 'sentry-not-installed' });
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('never throws on non-Error input', () => {
    expect(() => reportError(undefined, null)).not.toThrow();
    expect(() => reportError('plain string', { cookie: 'c=1' })).not.toThrow();
  });
});
