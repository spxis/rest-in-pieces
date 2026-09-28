import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  use: {
    baseURL: 'http://127.0.0.1:6802',
    browserName: 'chromium',
  },
  webServer: {
    command: 'pnpm exec vite --host 127.0.0.1 --port 6802 --strictPort',
    cwd: './apps/web',
    url: 'http://127.0.0.1:6802',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
