/**
 * Runs the whole API inside a browser tab: requests under a base URL are answered by the same app
 * the Node server runs, loaded on first use, and every other request goes to the network as usual.
 */
import type { AppOptions } from './core.ts';

type App = { fetch: (request: Request) => Response | Promise<Response> };

/**
 *
 * The virtual API base URL and API factory options used by a fetch adapter inside a page. The interface language is separate from generated data locale.
 *
 * @example
 * ```ts
 * import { installInBrowserApi, type InBrowserApiOptions } from "@johnmorrisdotca/rest-in-pieces/browser";
 * import { app } from "@johnmorrisdotca/rest-in-pieces";
 *
 * const options: InBrowserApiOptions = { base: "https://example.test/api", app: { log: false, safe: true } };
 * const restore = installInBrowserApi(options);
 * try { console.log((await fetch("https://example.test/api/health")).status); } finally { restore(); }
 * ```
 */
export interface InBrowserApiOptions {
  /** Where the API appears to live, resolved against the page's address. Defaults to `/api`. */
  base?: string;
  /** Passed to `createApp()`; for example `specUrl` when the docs page should fetch the spec elsewhere. */
  app?: Omit<AppOptions, 'mount'>;
}

/** Answers requests under `base` from the in-browser app and passes every other request through.
 *
 * @param base - An absolute URL prefix to intercept, matched by both origin and pathname.
 *
 * @param load - The lazy API loader, called once on the first matching request and cached for later matches.
 *
 * @param passThrough - The original fetch function for requests outside the virtual API prefix.
 *
 * @returns A fetch-compatible function that routes matching requests to the lazy app and all other requests to passThrough.
 *
 * @example
 * ```ts
 * import { inBrowserFetch } from "@johnmorrisdotca/rest-in-pieces/browser";
 * import { createApp } from "@johnmorrisdotca/rest-in-pieces/core";
 *
 * const localFetch = inBrowserFetch("https://example.test/api", async () => createApp({ log: false }), fetch);
 * console.log((await localFetch("https://example.test/api/users?seed=7&limit=2")).status);
 * ```
 */
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
    // The prefix travels with the request, so links the API writes to itself (safe avatars) keep it.
    const headers = new Headers(request.headers);
    if (prefix && !headers.has('x-forwarded-prefix')) headers.set('X-Forwarded-Prefix', prefix);
    const forwarded = new Request(new URL(`${path}${url.search}`, url.origin), {
      method: request.method,
      headers,
      body,
    });
    return (await app).fetch(forwarded);
  };
}

/**
 * Replaces the global `fetch` so requests under `base` are answered inside this tab, with no server.
 * The API itself is loaded on the first such request. Returns a function that puts `fetch` back.
 *
 * @param options - The virtual base and API options. Relative bases resolve against the browser page; use an absolute URL outside a browser.
 *
 * @returns A cleanup function that restores the original global fetch; call it when the adapter is no longer needed.
 *
 * @example
 * ```ts
 * import { installInBrowserApi } from "@johnmorrisdotca/rest-in-pieces/browser";
 * import { app } from "@johnmorrisdotca/rest-in-pieces";
 *
 * const restore = installInBrowserApi({ base: "https://example.test/api", app: { log: false } });
 * try {
 *   console.log((await fetch("https://example.test/api/health")).status);
 * } finally { restore(); }
 * ```
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
