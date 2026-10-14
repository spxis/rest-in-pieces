import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: '*.demo.mjs',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  projects: [
    { name: 'chromium-desk', use: { ...devices['Desktop Chrome'] } },
    { name: 'chromium-phone', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
    { name: 'webkit-phone', use: { ...devices['iPhone 13'] } },
  ],
});
