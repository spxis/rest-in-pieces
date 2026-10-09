/** Hands a request to the app with a base path taken off, for the hosts that mount the API under one. */

export type App = { fetch: (request: Request) => Response | Promise<Response> };

/** Answers a request under `prefix` from the app, with the prefix taken off its path. */
export async function forward(app: App, prefix: string, request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.startsWith(prefix) ? url.pathname.slice(prefix.length) || '/' : url.pathname;
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
  return app.fetch(forwarded);
}
