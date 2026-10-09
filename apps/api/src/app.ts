import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { serveStatic } from '@hono/node-server/serve-static';
import { createApp } from './core.ts';

// The playground is served from the same origin when it has been built alongside the API: `WEB_ROOT`
// when set, otherwise the copy packed into the npm package, otherwise the workspace's own build.
const webRoot =
  process.env.WEB_ROOT ??
  [new URL('../web', import.meta.url), new URL('../../web/dist', import.meta.url)]
    .map((url) => fileURLToPath(url))
    .find((dir) => existsSync(`${dir}/index.html`));
const serveWeb =
  process.env.SERVE_WEB !== 'false' && process.env.NODE_ENV !== 'test' && existsSync(`${webRoot}/index.html`);

export const app = createApp({
  log: process.env.NODE_ENV !== 'test',
  mount:
    serveWeb && webRoot
      ? (app) => {
          app.use('/assets/*', serveStatic({ root: webRoot }));
          app.get('/', serveStatic({ root: webRoot, path: 'index.html' }));
          app.get('/favicon.svg', serveStatic({ root: webRoot, path: 'favicon.svg' }));
        }
      : undefined,
});
