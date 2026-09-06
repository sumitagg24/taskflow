import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['html', { outputFolder: 'playwright-report' }], ['list']],
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:3000',
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
  webServer: process.env.CI
    ? {
        command: 'npm run build && npm run preview',
        port: 3000,
        timeout: 60_000,
        reuseExistingServer: false,
      }
    : {
        command: 'npm run dev',
        port: 3000,
        timeout: 30_000,
        reuseExistingServer: true,
      },
});
