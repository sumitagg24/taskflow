import { defineConfig, devices } from '@playwright/test';

// Env-overridable harness: the isolated E2E stack (see e2e/run-isolated.cjs)
// exports E2E_BASE_URL/E2E_API_URL/E2E_NO_WEBSERVER. Defaults keep the classic
// local dev pair (:3000 client + :5000 API) so every pre-existing spec
// resolves to the same servers unmodified when the vars are unset.
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

// Port for Playwright's own webServer: explicit E2E_WEB_PORT wins, otherwise
// derive it from E2E_BASE_URL so a custom baseURL keeps working without a
// second variable. Falls back to :3000 for bare-host URLs.
function webServerPort(): number {
  const explicit = process.env.E2E_WEB_PORT;
  if (explicit !== undefined && explicit !== '') {
    const n = Number(explicit);
    if (Number.isInteger(n) && n >= 1 && n <= 65535) return n;
    throw new Error(`[playwright.config] invalid E2E_WEB_PORT=${JSON.stringify(explicit)} — want 1-65535.`);
  }
  try {
    const port = new URL(baseURL).port;
    if (port) return Number(port);
  } catch {
    // Non-URL baseURL — fall through to the default.
  }
  return 3000;
}

const port = webServerPort();
// Command override for the same reason (default: the usual Vite dev server).
const webServerCommand = process.env.E2E_WEBSERVER_COMMAND ?? 'npm run dev';

// Snapshot baselines for visual.spec.ts live in e2e/__snapshots__/ with the
// project name as suffix (board-chromium.png, board-mobile.png, …). Only basic
// {tokens} are used — conditional spellings are not portable across versions.

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['html', { outputFolder: 'playwright-report' }], ['list']],
  timeout: 60_000,
  snapshotPathTemplate: '{testDir}/__snapshots__/{arg}-{projectName}{ext}',
  use: {
    baseURL,
    trace: process.env.CI ? 'on-first-retry' : 'retain-on-failure',
    screenshot: 'on',
    video: process.env.CI ? 'retain-on-failure' : 'off',
  },
  projects: [
    {
      // Cookie-based auth fixture: registers a fresh verified user via the
      // API and persists the browser cookie jar to e2e/.auth/user.json.
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/user.json',
      },
      dependencies: ['setup'],
    },
    {
      name: 'mobile',
      use: {
        ...devices['Pixel 7'],
        // Pin the handset viewport so mobile assertions are deterministic
        // across Playwright device-descriptor updates.
        viewport: { width: 390, height: 844 },
        storageState: 'e2e/.auth/user.json',
      },
      dependencies: ['setup'],
    },
  ],
  // The isolated harness (e2e/run-isolated.cjs) spawns + kills its own API and
  // client and sets E2E_NO_WEBSERVER=1, so Playwright must not boot a second
  // dev server underneath it. Manual runs against `npm run dev` keep the
  // webServer exactly as before.
  webServer: process.env.E2E_NO_WEBSERVER
    ? undefined
    : process.env.CI
      ? {
          command: 'npm run build && npm run preview',
          port,
          timeout: 60_000,
          reuseExistingServer: false,
        }
      : {
          command: webServerCommand,
          port,
          timeout: 30_000,
          reuseExistingServer: true,
        },
});
