import { execFileSync } from 'node:child_process';
import react from '@vitejs/plugin-react';
import { defaultClientConditions } from 'vite';
import { defineConfig } from 'vitest/config';
import apiPackage from '../api/package.json' with { type: 'json' };

/** The short SHA of the commit being built: GitHub's `GITHUB_SHA` in Actions, otherwise the checkout's HEAD. */
function commitSha(): string {
  const fromActions = process.env.GITHUB_SHA?.trim();
  if (fromActions) return fromActions.slice(0, 7);
  try {
    return execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], { encoding: 'utf8', stdio: 'pipe' }).trim();
  } catch {
    return '';
  }
}

// Inside the workspace the playground uses the package's TypeScript sources, so nothing needs building first.
const SOURCE = 'rest-in-pieces:source';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: { conditions: [SOURCE, ...defaultClientConditions] },
  // GitHub Pages serves the project from /<repository>/; PAGES_BASE overrides it for a custom domain.
  base: mode === 'pages' ? (process.env.PAGES_BASE ?? '/rest-in-pieces/') : '/',
  // The playground shows the API package's version, and the Pages build the commit too, so a live build is identifiable.
  define: {
    __APP_VERSION__: JSON.stringify(apiPackage.version),
    __APP_COMMIT__: JSON.stringify(mode === 'pages' ? commitSha() : ''),
  },
  // This project's local ports are 6800–6899: 6800 is the API, 6801 the playground. See AGENTS.md.
  server: { port: 6801, strictPort: true },
  build: {
    target: 'es2022',
    sourcemap: true,
    // The Pages build carries the whole API, fifteen Faker locales included, in a chunk loaded on first request,
    // so it is large by design: about 1.7 MB, 560 KB gzipped. The limit still warns if it grows much further.
    ...(mode === 'pages' ? { outDir: 'dist-pages', chunkSizeWarningLimit: 1800 } : {}),
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
}));
