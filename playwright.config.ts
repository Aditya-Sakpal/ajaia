import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests against a running app (local dev server by default, or the deployed URL):
 *   npm run dev                       # in another terminal
 *   npm run test:e2e
 *   BASE_URL=https://ajaia-docs.salesdesk-app.workers.dev npm run test:e2e
 * Tests create their own documents and delete them afterwards.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
