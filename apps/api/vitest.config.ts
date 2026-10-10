import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: { NODE_ENV: 'test' },
    // A few tests build every record of every locale, or a request at its size limit: real work, not a wait. With
    // coverage on they take 2.5 to 3 s on a Mac and about 2.2 times that on a GitHub runner, past vitest's 5 s
    // default, which stopped the release runs of 2.14.0, 2.15.0 and 2.19.1. A hang still fails, at 20 s.
    testTimeout: 20_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/server.ts', 'src/main.ts', 'src/types/**'],
      thresholds: { lines: 95, functions: 95, branches: 85, statements: 95 },
    },
  },
});
