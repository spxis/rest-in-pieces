import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { serveStatic } from '@hono/node-server/serve-static';
import { flagsFromEnv, safeFromEnv, sessionFromEnv, streamsFromEnv } from './cli.ts';
import { type AppOptions, createApp } from './core.ts';

// The playground is served from the same origin when it has been built alongside the API: `WEB_ROOT`
// when set, otherwise the copy packed into the npm package, otherwise the workspace's own build.
const webRoot =
  process.env.WEB_ROOT ??
  [new URL('../web', import.meta.url), new URL('../../web/dist', import.meta.url)]
    .map((url) => fileURLToPath(url))
    .find((dir) => existsSync(`${dir}/index.html`));
const serveWeb =
  process.env.SERVE_WEB !== 'false' && process.env.NODE_ENV !== 'test' && existsSync(`${webRoot}/index.html`);

/** The API as the Node server runs it: logging, and the playground on the same origin when it has been built. */
export function createNodeApp({
  session,
  safe,
  streams,
  flags,
}: Pick<AppOptions, 'session' | 'safe' | 'streams' | 'flags'> = {}) {
  return createApp({
    log: process.env.NODE_ENV !== 'test',
    session,
    safe,
    streams,
    flags,
    mount:
      serveWeb && webRoot
        ? (app) => {
            app.use('/assets/*', serveStatic({ root: webRoot }));
            app.get('/', serveStatic({ root: webRoot, path: 'index.html' }));
            app.get('/favicon.svg', serveStatic({ root: webRoot, path: 'favicon.svg' }));
          }
        : undefined,
  });
}

/**
 * The Node app, keeping writes when `REST_IN_PIECES_SESSION` asks it to and stateless otherwise, and serving safe
 * values when `REST_IN_PIECES_SAFE` does.
 */
export const app = createNodeApp({
  session: sessionFromEnv(process.env),
  safe: safeFromEnv(process.env),
  streams: streamsFromEnv(process.env),
  flags: flagsFromEnv(process.env),
});
