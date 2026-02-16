// PLAYWRIGHT CONFIGURATION FOR E2E TESTS
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run dev -- --webpack',
    port: 3000,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});