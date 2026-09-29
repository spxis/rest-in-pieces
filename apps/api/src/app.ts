import { existsSync } from 'node:fs';
import { serveStatic } from '@hono/node-server/serve-static';
import { createApp } from './core.ts';

// The playground is served from the same origin when it has been built alongside the API.
const webRoot = process.env.WEB_ROOT ?? new URL('../../web/dist', import.meta.url).pathname;
const serveWeb =
  process.env.SERVE_WEB !== 'false' && process.env.NODE_ENV !== 'test' && existsSync(`${webRoot}/index.html`);

export const app = createApp({
  log: process.env.NODE_ENV !== 'test',
  mount: serveWeb
    ? (app) => {
        app.use('/assets/*', serveStatic({ root: webRoot }));
        app.get('/', serveStatic({ root: webRoot, path: 'index.html' }));
        app.get('/favicon.svg', serveStatic({ root: webRoot, path: 'favicon.svg' }));
      }
    : undefined,
});
