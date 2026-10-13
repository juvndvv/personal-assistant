import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env['E2E_BASE_URL'] ?? 'https://localhost';
const isCi = process.env['CI'] !== undefined;

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCi,
  retries: isCi ? 1 : 0,
  reporter: isCi ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    ignoreHTTPSErrors: true,
    locale: 'es-ES',
    timezoneId: 'Europe/Madrid',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts$/, use: { ...devices['Desktop Chrome'] } },
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, dependencies: ['setup'] },
    { name: 'webkit', use: { ...devices['iPhone 15'] }, dependencies: ['setup'] },
  ],
});
