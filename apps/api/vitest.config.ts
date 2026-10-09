import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: { NODE_ENV: 'test' },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/server.ts', 'src/main.ts', 'src/types/**'],
      thresholds: { lines: 95, functions: 95, branches: 85, statements: 95 },
    },
  },
});
