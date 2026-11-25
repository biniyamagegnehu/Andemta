import { defineConfig, devices } from '@playwright/test';

const API_PORT = process.env.PLAYWRIGHT_API_PORT || '4001';
const WEB_PORT = process.env.PLAYWRIGHT_WEB_PORT || '3001';
const API_URL = process.env.PLAYWRIGHT_API_URL || `http://127.0.0.1:${API_PORT}`;
const WEB_URL = process.env.PLAYWRIGHT_WEB_URL || `http://127.0.0.1:${WEB_PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: {
    timeout: 15_000,
  },
  reporter: [['list']],
  use: {
    baseURL: WEB_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium-chrome',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        headless: true,
      },
    },
  ],
  webServer: [
    {
      command: 'npx nest start',
      url: `${API_URL}/api/v1/health`,
      cwd: '../api',
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        PORT: API_PORT,
        FRONTEND_URL: WEB_URL,
        RATE_LIMIT_ENABLED: 'false',
      },
    },
    {
      command: `npx next dev -H 127.0.0.1 -p ${WEB_PORT}`,
      url: WEB_URL,
      cwd: '.',
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        NEXT_PUBLIC_API_BASE_URL: `${API_URL}/api/v1`,
      },
    },
  ],
});
