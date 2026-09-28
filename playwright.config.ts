import { defineConfig, devices } from '@playwright/test';

const API = 'http://127.0.0.1:8787';
const WEB = 'http://127.0.0.1:5174';

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
      env: { PORT: '8787', SERVE_WEB: 'false' },
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'pnpm exec vite --host 127.0.0.1 --port 5174 --strictPort',
      cwd: './apps/web',
      url: WEB,
      env: { VITE_API_BASE_URL: API },
      reuseExistingServer: !process.env.CI,
    },
  ],
});
