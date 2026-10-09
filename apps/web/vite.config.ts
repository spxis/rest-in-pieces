import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // GitHub Pages serves the project from /<repository>/; PAGES_BASE overrides it for a custom domain.
  base: mode === 'pages' ? (process.env.PAGES_BASE ?? '/rest-in-pieces/') : '/',
  // This project's local ports are 6800–6899: 6800 is the API, 6801 the playground. See AGENTS.md.
  server: { port: 6801, strictPort: true },
  build: {
    target: 'es2022',
    sourcemap: true,
    // The Pages build carries the whole API in a chunk loaded on first request, so it is large by design.
    ...(mode === 'pages' ? { outDir: 'dist-pages', chunkSizeWarningLimit: 1300 } : {}),
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
}));
