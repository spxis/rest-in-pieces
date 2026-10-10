# Use with

How to use REST in Pieces with the tools it plugs into. [Back to the README](https://github.com/spxis/rest-in-pieces#readme).

## Vite

`@johnmorrisdotca/rest-in-pieces/vite` serves the whole API from the Vite dev server, under `/api` on the same origin as your app: one line, no second process, no proxy, no entry file. It applies to `vite dev` only, so nothing of it reaches a production build, and responses stream, so `?trickle=` arrives in pieces. `vite` is an optional peer dependency.

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { restInPieces } from '@johnmorrisdotca/rest-in-pieces/vite';

export default defineConfig({ plugins: [restInPieces()] }); // fetch('/api/users?limit=10') in the app
```

`restInPieces({ base: '/mock' })` moves it, and `app` passes options to `createApp()`: `restInPieces({ app: { session: true } })` keeps writes until `POST /api/reset` or a restart of the dev server. Every path outside the base stays Vite's. Because it runs in the dev server rather than the page, server-side rendering and any HTTP client work without a service worker.

Two other ways, neither needing the plugin:

- **[`@hono/vite-dev-server`](https://github.com/honojs/vite-plugins/tree/main/packages/dev-server)** runs a fetch-style app inside `vite dev` from an entry file. Prefer it when you are writing Hono routes of your own beside the fake ones, since it reloads the entry when it changes. Mount the API in the entry and leave every other path to Vite with `exclude`; its own `base` option moves Vite's base too, so it does not suit an app served at `/`.

  ```ts
  // src/api.ts
  import { Hono } from 'hono';
  import { createApp } from '@johnmorrisdotca/rest-in-pieces/core';
  export default new Hono().route('/api', createApp());

  // vite.config.ts: plugins: [devServer({ entry: 'src/api.ts', exclude: [/^\/(?!api(\/|\?|$))/] })]
  ```

- **Vite's `server.proxy`**, with no code at all: run `npx @johnmorrisdotca/rest-in-pieces` in another terminal and proxy to it. Prefer it when the same API should also answer curl, a phone on the network or another app.

  ```ts
  server: { proxy: { '/api': { target: 'http://localhost:6800', rewrite: (path) => path.replace(/^\/api/, '') } } }
  ```

## Mock Service Worker

`@johnmorrisdotca/rest-in-pieces/msw` gives [MSW](https://mswjs.io/) one handler that answers everything under a base path from the whole API. MSW's service worker catches `fetch`, `XMLHttpRequest` and axios alike, and a handler placed before it still wins, so a test can override one endpoint and leave the rest to the API. Pass MSW's own `http`: the entry imports nothing from `msw`, so it works with MSW 2 (`from 'msw'`) and MSW 3 (`from 'msw'` or `from 'msw/http'`). `msw` is an optional peer dependency.

**In the browser**, once the worker script is in place (`npx msw init public`):

```ts
import { http } from 'msw';
import { setupWorker } from 'msw/browser';
import { restInPiecesHandlers } from '@johnmorrisdotca/rest-in-pieces/msw';

await setupWorker(...restInPiecesHandlers({ http })).start({ onUnhandledRequest: 'bypass' }); // MSW 3: onUnhandledFrame
```

**In Vitest or Jest.** MSW in Node matches absolute URLs only, so give the base as one and point the code under test at it:

```ts
import { http } from 'msw';
import { setupServer } from 'msw/node';
import { restInPiecesHandlers } from '@johnmorrisdotca/rest-in-pieces/msw';

export const server = setupServer(...restInPiecesHandlers({ base: 'http://localhost/api', http }));
// beforeAll(() => server.listen()); afterEach(() => server.resetHandlers()); afterAll(() => server.close());
```

`server.use(http.get('http://localhost/api/users', () => HttpResponse.json({ results: [] })))` overrides one endpoint for one test; every other request under the base still reaches the API.

**With MSW 3's Vite plugin**, which serves the worker and leaves it out of production builds (`plugins: [msw()]` from `msw/vite` in `vite.config.ts`):

```ts
if (import.meta.env.DEV) {
  const { network } = await import('virtual:msw');
  const { http } = await import('msw/http');
  const { restInPiecesHandlers } = await import('@johnmorrisdotca/rest-in-pieces/msw');
  network.configure({ handlers: restInPiecesHandlers({ http }) });
  await network.enable();
}
```

`restInPiecesHandlers({ base, app, http })` takes the same `base` (default `/api`) and `app` options as `installInBrowserApi`, and loads the API on the first request it matches. With `app: { session: true }`, writes are kept by the handlers for as long as the page (or the test file, in Node) lives; a `POST` to `/api/reset` puts the seed back between tests.

## Storybook

With [msw-storybook-addon](https://github.com/mswjs/msw-storybook-addon), start the worker with the handlers once in `.storybook/preview.ts`. Handlers given to `setupWorker` survive the addon's reset between stories:

```ts
import { http } from 'msw';
import { setupWorker } from 'msw/browser';
import { mswLoader } from 'msw-storybook-addon/csf3'; // CSF Next: addons: [addonMsw(start)]
import { restInPiecesHandlers } from '@johnmorrisdotca/rest-in-pieces/msw';

const start = async () => {
  const worker = setupWorker(...restInPiecesHandlers({ http }));
  await worker.start({ onUnhandledRequest: 'bypass' });
  return worker;
};
export default { loaders: [mswLoader(start)] };
```

The loading, error and overflow stories then need no mocking code, only another URL:

```ts
export const Loading = { args: { src: '/api/users?delay=3000' } };
export const Failed = { args: { src: '/api/users?status=500' } };
export const Messy = { args: { src: '/api/users?messy=true&seed=3' } };
```

## Next.js

A catch-all route handler hosts the whole API inside a Next.js app, on its own origin. Hono's `mount` takes the base off the path before the API sees it (`hono` is already a dependency of this package; add it to yours if your package manager is strict):

```ts
// app/api/[[...path]]/route.ts
import { Hono } from 'hono';
import { createApp } from '@johnmorrisdotca/rest-in-pieces/core';

const app = new Hono().mount('/api', createApp().fetch);
const handler = (request: Request) => app.fetch(request);
export { handler as GET, handler as HEAD, handler as POST, handler as PUT, handler as PATCH, handler as DELETE, handler as OPTIONS };
```

The same `createApp().fetch` runs on any other fetch-style host: Cloudflare Workers, Deno, Bun or a Vercel function.

## Playwright

No server and no MSW: answer the page's API requests from the app in the test process with `page.route`, so each test gets the same data and can turn on a drill by URL:

```ts
import { createApp } from '@johnmorrisdotca/rest-in-pieces';

const app = createApp();
test.beforeEach(({ page }) => page.route('**/api/**', async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  const response = await app.request(url.pathname.replace(/^\/api/, '') + url.search, { method: request.method(), headers: request.headers(), body: request.postDataBuffer() });
  await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
}));
```

Or start the API beside your app with Playwright's `webServer` (`command: 'npx @johnmorrisdotca/rest-in-pieces --port 6800'`, `url: 'http://localhost:6800/health'`).

For a CRUD flow that reads its own writes, make the app with `createApp({ session: true })` and put the seed back before each test, so every test starts from the same data:

```ts
const app = createApp({ session: true });
test.beforeEach(() => app.request('/reset', { method: 'POST' }));
```

A signed-in test can sign in once and keep the token: `const { accessToken } = await (await app.request('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'password' }) })).json()`. See [Sign-in](https://github.com/spxis/rest-in-pieces#sign-in-fake-auth).

[`@msw/playwright`](https://github.com/mswjs/playwright) (MSW 3) does the same through MSW, so the [MSW handlers](#mock-service-worker) plug straight in. Give them the base at your app's origin:

```ts
import { defineNetworkFixture } from '@msw/playwright';

const handlers = restInPiecesHandlers({ base: 'http://localhost:5173/api', http });
// in test.extend: const network = defineNetworkFixture({ context, handlers }); await network.enable(); await use(network); await network.disable();
```

## Cypress

Cypress runs its intercept handlers in the browser, so the API runs as a server beside your app. With [start-server-and-test](https://github.com/bahmutov/start-server-and-test) and the package installed as a dev dependency:

```json
"scripts": {
  "api": "rest-in-pieces --port 6800",
  "e2e": "start-test api http://localhost:6800/health dev http://localhost:5173 'cypress run'"
}
```

Slow, failing and flaky answers come from the API's own `?delay=`, `?status=` and `?fail=`, with no mocking code in the test. To test a form that saves, start the API with `--session` (`"api": "rest-in-pieces --port 6800 --session"`) and put the seed back before each test with `beforeEach(() => cy.request('POST', 'http://localhost:6800/reset'))`. Keep `cy.intercept` for the faults no server can make, such as a dropped connection: `cy.intercept('GET', '/api/users*', { forceNetworkError: true })`. Or call `installInBrowserApi()` in the app under test and need no server at all.

## Typed clients

The package ships the API's OpenAPI 3.1 document as `@johnmorrisdotca/rest-in-pieces/openapi.json`, and TypeScript types for every path and schema, generated from it by [openapi-typescript](https://openapi-ts.dev/), as `@johnmorrisdotca/rest-in-pieces/types`. They describe the version installed, with nothing running. With [openapi-fetch](https://openapi-ts.dev/openapi-fetch/):

```ts
import createClient from 'openapi-fetch';
import type { paths } from '@johnmorrisdotca/rest-in-pieces/types';

const api = createClient<paths, 'application/json'>({ baseUrl: 'http://localhost:6800' });
const { data } = await api.GET('/users', { params: { query: { limit: '10', seed: '42' } } });
if (data && !Array.isArray(data)) console.log(data.metadata.total, data.results[0]?.email); // metadata=false returns a bare array
```

`components['schemas']['User']`, `['Person']`, `['Product']` and the rest type single records, `['UserInput']` and its siblings the write bodies, and `['AuthTokens']`, `['AuthUser']`, `['AuthError']` and `['Session']` the sign-in and session answers. Query parameters are strings, as they are in a URL. To generate the types yourself, point openapi-typescript at the document: `npx openapi-typescript node_modules/@johnmorrisdotca/rest-in-pieces/dist/openapi.json -o rest-in-pieces.d.ts`, or at `/openapi.json` on any running instance.

## Any origin

CORS is on by default, so a frontend on any dev-server origin can call the API directly. Every response carries `Access-Control-Allow-Origin: *`; a preflight `OPTIONS` answers `204` with the methods allowed and the requested headers echoed back, so a write with an `Authorization` header preflights too; and `X-Total-Count`, `Link`, `ETag`, `X-Simulated`, `Retry-After`, `Location` and `WWW-Authenticate` are exposed to scripts.

## Your own API's OpenAPI document

When the API you build against has an OpenAPI document, mock all of it instead of the built-in datasets: `npx @johnmorrisdotca/rest-in-pieces serve --openapi ./openapi.yaml` serves every operation with seeded data in the shape of its response schema and checks requests against the document, and `createMockApp(document)` from `@johnmorrisdotca/rest-in-pieces/mock` answers the same in process, in a test or from a Mock Service Worker handler. See [Mock your own API from its OpenAPI document](mock-your-openapi.md).
