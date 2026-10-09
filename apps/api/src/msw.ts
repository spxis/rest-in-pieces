/**
 * Mock Service Worker handlers that answer from the whole API: one handler for everything under a
 * base path, served by the same app the Node server runs, loaded on the first request it matches.
 *
 * Nothing here imports `msw`. The caller passes MSW's own `http` namespace, so the same entry
 * works with MSW 2 (`import { http } from 'msw'`) and MSW 3 (`import { http } from 'msw/http'`).
 */
import type { AppOptions } from './core.ts';
import { type App, forward } from './lib/forward.ts';

/**
 * The one part of MSW's `http` namespace the handlers use: `http.all(path, resolver)`.
 * `Handler` is whatever MSW returns, so the array this module hands back is typed as MSW's own.
 */
export interface MswHttp<Handler> {
  all(path: string, resolver: (info: { request: Request }) => Promise<Response>): Handler;
}

export interface RestInPiecesHandlersOptions<Handler> {
  /**
   * Where the API appears to live. Defaults to `/api`. In Node (`setupServer`), MSW matches only
   * absolute URLs, so pass one there, such as `http://localhost/api`.
   */
  base?: string;
  /** Passed to `createApp()`; for example `specUrl` when the docs page should fetch the spec elsewhere. */
  app?: Omit<AppOptions, 'mount'>;
  /** MSW's `http` namespace: `import { http } from 'msw'`, or `from 'msw/http'` on MSW 3. */
  http: MswHttp<Handler>;
}

/**
 * Returns MSW request handlers, one handler in an array, that answer every request under `base`
 * from REST in Pieces. Spread them into `setupWorker(...)`, `setupServer(...)` or
 * `network.configure({ handlers })`; handlers placed before them still win.
 */
export function restInPiecesHandlers<Handler>({
  base = '/api',
  app: options,
  http,
}: RestInPiecesHandlersOptions<Handler>): Handler[] {
  const trimmed = base.replace(/\/+$/, '');
  const prefix = new URL(trimmed || '/', 'http://base.invalid').pathname.replace(/\/+$/, '');
  let app: Promise<App> | undefined;
  return [
    http.all(`${trimmed}/*`, async ({ request }) => {
      app ??= import('./core.ts').then(({ createApp }) => createApp(options));
      return forward(await app, prefix, request);
    }),
  ];
}
