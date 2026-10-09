/**
 * Runs the whole API inside a browser tab: requests under a base URL are answered by the same app
 * the Node server runs, loaded on first use, and every other request goes to the network as usual.
 */
import type { AppOptions } from './core.ts';

type App = { fetch: (request: Request) => Response | Promise<Response> };

export interface InBrowserApiOptions {
  /** Where the API appears to live, resolved against the page's address. Defaults to `/api`. */
  base?: string;
  /** Passed to `createApp()`; for example `specUrl` when the docs page should fetch the spec elsewhere. */
  app?: Omit<AppOptions, 'mount'>;
}

/** Answers requests under `base` from the in-browser app and passes every other request through. */
export function inBrowserFetch(base: string, load: () => Promise<App>, passThrough: typeof fetch): typeof fetch {
  const prefix = new URL(base).pathname.replace(/\/+$/, '');
  let app: Promise<App> | undefined;
  return async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const inside =
      url.origin === new URL(base).origin && (url.pathname === prefix || url.pathname.startsWith(`${prefix}/`));
    if (!inside) return passThrough(input, init);
    app ??= load();
    const path = url.pathname.slice(prefix.length) || '/';
    // Copied field by field: re-wrapping a Request drops its body in some environments.
    const body = request.method === 'GET' || request.method === 'HEAD' ? null : await request.arrayBuffer();
    const forwarded = new Request(new URL(`${path}${url.search}`, url.origin), {
      method: request.method,
      headers: request.headers,
      body,
    });
    return (await app).fetch(forwarded);
  };
}

/**
 * Replaces the global `fetch` so requests under `base` are answered inside this tab, with no server.
 * The API itself is loaded on the first such request. Returns a function that puts `fetch` back.
 */
export function installInBrowserApi({ base = '/api', app }: InBrowserApiOptions = {}): () => void {
  const page = (globalThis as { location?: { href: string } }).location?.href;
  const original = globalThis.fetch;
  globalThis.fetch = inBrowserFetch(
    new URL(base, page).href,
    () => import('./core.ts').then(({ createApp }) => createApp(app)),
    original.bind(globalThis),
  );
  return () => {
    globalThis.fetch = original;
  };
}
