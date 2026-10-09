import { defineConfig, devices } from '@playwright/test';

// Test servers take ports from this project's 6800–6899 block, clear of the dev servers on 6800 and 6801.
// E2E_API_PORT and E2E_WEB_PORT move them, e.g. for a second worktree.
// E2E_SESSION_PORT is a second API that keeps writes, and E2E_PAGES_PORT the GitHub Pages build with the API in the tab.
const API_PORT = process.env.E2E_API_PORT ?? '6820';
const WEB_PORT = process.env.E2E_WEB_PORT ?? '6821';
const SESSION_PORT = process.env.E2E_SESSION_PORT ?? '6822';
const PAGES_PORT = process.env.E2E_PAGES_PORT ?? '6823';
const API = `http://127.0.0.1:${API_PORT}`;
const WEB = `http://127.0.0.1:${WEB_PORT}`;
const PAGES = `http://127.0.0.1:${PAGES_PORT}/rest-in-pieces/`;
const SESSION_API = `http://127.0.0.1:${SESSION_PORT}`;

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
  projects: [
    { name: 'playground', testIgnore: /pages\.spec\.ts/ },
    { name: 'pages', testMatch: /pages\.spec\.ts/, use: { baseURL: PAGES } },
  ],
  webServer: [
    {
      command: 'node src/server.ts',
      cwd: './apps/api',
      url: `${API}/health`,
      env: { PORT: API_PORT, SERVE_WEB: 'false' },
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'node src/server.ts',
      cwd: './apps/api',
      url: `${SESSION_API}/health`,
      env: { PORT: SESSION_PORT, SERVE_WEB: 'false', REST_IN_PIECES_SESSION: 'true' },
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `pnpm exec vite --host 127.0.0.1 --port ${WEB_PORT} --strictPort`,
      cwd: './apps/web',
      url: WEB,
      env: { VITE_API_BASE_URL: API },
      reuseExistingServer: !process.env.CI,
    },
    {
      // The demo as it is published: built, then served under /rest-in-pieces/ with the whole API in the page.
      command: `pnpm build:pages && pnpm exec vite preview --mode pages --host 127.0.0.1 --port ${PAGES_PORT} --strictPort`,
      cwd: './apps/web',
      url: PAGES,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
