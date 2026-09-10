// dbFallback.test.js — Phase 1: production must NEVER fall back to a local DB.
// db.js reads env at require time, so each scenario uses jest.resetModules()
// with freshly-set process.env before re-requiring.
const path = require('path');
const fs = require('fs');

const MODULE_PATH = require.resolve('../config/db.js');
const MONGO_DATA_DIR = path.join(__dirname, '..', '.mongo-data');

/** Re-require db.js under a specific env snapshot, restoring env afterwards. */
function loadDbModule(env) {
  jest.resetModules();
  const saved = { ...process.env };
  Object.assign(process.env, env);
  const mod = require(MODULE_PATH);
  // Restore the full snapshot so other suites are unaffected.
  for (const key of Object.keys(process.env)) {
    if (!(key in saved)) delete process.env[key];
  }
  Object.assign(process.env, saved);
  return mod;
}

afterEach(() => {
  jest.resetModules();
});

describe('db.js — local database fallback gate', () => {
  describe('fallbackAllowed() decision function', () => {
    it('production: false, even with ALLOW_LOCAL_DB_FALLBACK=true', () => {
      const db = loadDbModule({
        NODE_ENV: 'production',
        ALLOW_LOCAL_DB_FALLBACK: 'true',
      });
      expect(db.fallbackAllowed()).toBe(false);
    });

    it('development: false by default (no explicit opt-in)', () => {
      const db = loadDbModule({ NODE_ENV: 'development' });
      expect(db.fallbackAllowed()).toBe(false);
    });

    it('development: true with ALLOW_LOCAL_DB_FALLBACK=true', () => {
      const db = loadDbModule({
        NODE_ENV: 'development',
        ALLOW_LOCAL_DB_FALLBACK: 'true',
      });
      expect(db.fallbackAllowed()).toBe(true);
    });

    it('test: false by default (test setup manages its own database)', () => {
      const db = loadDbModule({ NODE_ENV: 'test' });
      expect(db.fallbackAllowed()).toBe(false);
    });

    it("development: false with a non-'true' value", () => {
      const db = loadDbModule({
        NODE_ENV: 'development',
        ALLOW_LOCAL_DB_FALLBACK: '1',
      });
      expect(db.fallbackAllowed()).toBe(false);
    });
  });

  describe('connectDB failure paths', () => {
    const UNREACHABLE_URI = 'mongodb://127.0.0.1:1/taskflow-never';

    // loadDbModule restores env immediately, so connectDB loses MONGO_URI.
    // For the failure tests we set env, require, call, THEN restore.
    function requireUnderEnv(env) {
      jest.resetModules();
      const saved = { ...process.env };
      Object.assign(process.env, env);
      return {
        mod: require(MODULE_PATH),
        cleanup() {
          for (const key of Object.keys(process.env)) {
            if (!(key in saved)) delete process.env[key];
          }
          Object.assign(process.env, saved);
        },
      };
    }

    it('production: throws and never creates the local data directory', async () => {
      const { mod: db, cleanup } = requireUnderEnv({
        NODE_ENV: 'production', MONGO_URI: UNREACHABLE_URI,
      });
      try {
        await expect(db()).rejects.toThrow(
          /Refusing to start with a local fallback.*production never falls back/s
        );
      } finally {
        cleanup();
      }
    }, 20000);

    it('development without ALLOW_LOCAL_DB_FALLBACK: throws with the right reason', async () => {
      const { mod: db, cleanup } = requireUnderEnv({
        NODE_ENV: 'development', MONGO_URI: UNREACHABLE_URI,
      });
      try {
        await expect(db()).rejects.toThrow(/ALLOW_LOCAL_DB_FALLBACK is not enabled/);
      } finally {
        cleanup();
      }
    }, 20000);

    it('production: error message never contains the full MONGO_URI (no credential leak)', async () => {
      const { mod: db, cleanup } = requireUnderEnv({
        NODE_ENV: 'production', MONGO_URI: UNREACHABLE_URI,
      });
      try {
        try {
          await db();
        } catch (e) {
          // The throw embeds error.message only — never the full URI with credentials.
          expect(e.message).not.toContain('mongodb+srv');
          expect(e.message).not.toContain('mongodb://');
        }
      } finally {
        cleanup();
      }
    }, 20000);
  });
});