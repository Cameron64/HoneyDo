import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for HoneyDo E2E tests.
 *
 * Tests run with DEV_BYPASS_AUTH enabled to skip Clerk authentication.
 *
 * To run tests:
 * 1. Start servers manually: DEV_BYPASS_AUTH=true VITE_DEV_BYPASS_AUTH=true pnpm dev
 * 2. Run tests: pnpm test:e2e
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // Run tests sequentially for wizard
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Single worker for stateful tests
  reporter: [['html'], ['list']],
  timeout: 120000, // 2 minutes per test (AI can be slow)

  use: {
    baseURL: process.env.E2E_BASE_URL || 'https://localhost:5174',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    ignoreHTTPSErrors: true, // For local self-signed certs
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
