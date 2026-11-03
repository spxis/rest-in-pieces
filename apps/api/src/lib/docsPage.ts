import { Scalar } from '@scalar/hono-api-reference';
import type { Context, MiddlewareHandler } from 'hono';
import { secureHeaders } from 'hono/secure-headers';

/**
 * The version of Scalar's API reference the `/docs` and `/__mock/docs` pages load from jsDelivr, and the SRI hash
 * of that exact file (`npm pack @scalar/api-reference@<version>` and `dist/browser/standalone.js` give the same
 * bytes). Both move together: a new version needs a new hash, and `docsPage.test.ts` checks the pair is written
 * into the page.
 */
export const SCALAR_VERSION = '1.75.0';
export const SCALAR_URL = `https://cdn.jsdelivr.net/npm/@scalar/api-reference@${SCALAR_VERSION}/dist/browser/standalone.js`;
export const SCALAR_INTEGRITY = 'sha384-xgelKlDcc+BYp0O+ZYzFesLnWCgGpEbXVVZWNQT6WyZYygN01tbEMygnjPXb5OPI';

/**
 * The API reference page. The script is pinned to one version and checked against its SRI hash, so a changed or
 * tampered file on the CDN does not run on the API's own origin. The page still needs the network for the script.
 */
export function docsPage(options: {
  url: string;
  pageTitle: string;
  theme?: 'default';
}): (c: Context) => Promise<Response> {
  const reference = Scalar({ ...options, cdn: SCALAR_URL });
  return async (c) => {
    const page = await reference(c, async () => {});
    if (!(page instanceof Response)) throw new Error('The API reference middleware answered nothing.');
    const html = await page.text();
    const tag = `<script src="${SCALAR_URL}"`;
    if (!html.includes(tag)) throw new Error('The API reference page no longer loads the pinned script.');
    return c.html(html.replace(tag, `${tag} integrity="${SCALAR_INTEGRITY}" crossorigin="anonymous"`));
  };
}

/** Whether a request came over HTTPS, directly or through a proxy that says so. */
export function isHttps(c: Context): boolean {
  const forwarded = c.req.header('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase();
  return forwarded === 'https' || new URL(c.req.url).protocol === 'https:';
}

/**
 * The standard security headers, with `Strict-Transport-Security` only on a request that came over HTTPS: a
 * browser ignores it on plain HTTP, and a local server on `http://localhost` should not be telling clients to
 * insist on HTTPS.
 */
export function securityHeaders(): MiddlewareHandler[] {
  const standard = secureHeaders({ crossOriginResourcePolicy: 'cross-origin', strictTransportSecurity: false });
  return [
    standard,
    async (c, next) => {
      await next();
      if (isHttps(c)) c.res.headers.set('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
    },
  ];
}

/** Adds the security headers to every route of `app`. */
export function useSecurityHeaders(
  app: { use: (path: string, handler: MiddlewareHandler) => unknown },
  path = '*',
): void {
  for (const handler of securityHeaders()) app.use(path, handler);
}
