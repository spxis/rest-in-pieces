import { defineConfig, devices } from '@playwright/test';

// Test servers take ports from this project's 6800–6899 block, clear of the dev servers on 6800 and 6801.
// E2E_API_PORT and E2E_WEB_PORT move them, e.g. for a second worktree.
const API_PORT = process.env.E2E_API_PORT ?? '6820';
const WEB_PORT = process.env.E2E_WEB_PORT ?? '6821';
const API = `http://127.0.0.1:${API_PORT}`;
const WEB = `http://127.0.0.1:${WEB_PORT}`;

/** End-to-end tests drive the real playground against the real API. */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: WEB,
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {},
  },
  webServer: [
    {
      command: 'node src/server.ts',
      cwd: './apps/api',
      url: `${API}/health`,
      env: { PORT: API_PORT, SERVE_WEB: 'false' },
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `pnpm exec vite --host 127.0.0.1 --port ${WEB_PORT} --strictPort`,
      cwd: './apps/web',
      url: WEB,
      env: { VITE_API_BASE_URL: API },
      reuseExistingServer: !process.env.CI,
    },
  ],
});
