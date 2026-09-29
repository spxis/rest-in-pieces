/**
 * The GitHub Pages build has no server, so the whole API runs inside the page instead: requests to
 * the in-browser base URL are answered by the same app the Node server runs, loaded on first use.
 */
export const IN_BROWSER = import.meta.env.MODE === 'pages';

/** Where the in-browser API appears to live: `api/` beside the playground. */
export function inBrowserBase(): string {
  return new URL(`${import.meta.env.BASE_URL}api`, window.location.href).href;
}

export function isInBrowserApi(base: string): boolean {
  return IN_BROWSER && base.trim().replace(/\/+$/, '') === inBrowserBase();
}

/** Whether a request URL is answered by the in-browser API. */
export function isInBrowserUrl(url: string): boolean {
  return IN_BROWSER && url.startsWith(`${inBrowserBase()}/`);
}

type App = { fetch: (request: Request) => Response | Promise<Response> };

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

export function installInBrowserApi(): void {
  window.fetch = inBrowserFetch(
    inBrowserBase(),
    () => import('@rest-in-pieces/api/core').then(({ createApp }) => createApp()),
    window.fetch.bind(window),
  );
}
