/**
 * A Vite plugin that serves the whole API from the dev server, under a base path on the same origin:
 * no second process, no proxy, no entry file and no handlers. It applies to `vite dev` only, so
 * nothing of it reaches a production build.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { getRequestListener } from '@hono/node-server';
import type { Plugin } from 'vite';
import type { AppOptions } from './core.ts';
import { type App, forward } from './lib/forward.ts';

export interface RestInPiecesPluginOptions {
  /** The path the API is served under on the dev server. Defaults to `/api`. */
  base?: string;
  /** Passed to `createApp()`; for example `specUrl` when the docs page should fetch the spec elsewhere. */
  app?: Omit<AppOptions, 'mount'>;
}

/**
 * Returns the plugin. `restInPieces()` answers `/api/users?limit=5` on the dev server's own origin
 * from REST in Pieces and leaves every other path to Vite. Responses stream, so `?trickle=` arrives
 * in pieces as it does from the standalone server.
 */
export function restInPieces({ base = '/api', app: options }: RestInPiecesPluginOptions = {}): Plugin {
  const prefix = `/${base.replace(/^\/+|\/+$/g, '')}`.replace(/^\/$/, '');
  let app: Promise<App> | undefined;
  const listener = getRequestListener(
    async (request) => {
      app ??= import('./core.ts').then(({ createApp }) => createApp(options));
      return forward(await app, prefix, request);
    },
    // Vite and its other plugins share this process, so its global Request and Response stay as they are.
    { overrideGlobalObjects: false },
  );
  const inside = (url: string) => {
    const path = url.split(/[?#]/, 1)[0] ?? '';
    return path === prefix || path.startsWith(`${prefix}/`);
  };

  return {
    name: 'rest-in-pieces',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: (error?: unknown) => void) => {
        if (!inside(req.url ?? '/')) return next();
        listener(req, res).catch(next);
      });
    },
  };
}
