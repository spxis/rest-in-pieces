# Starters, and Postman and Bruno collections

Two ways to try REST in Pieces without writing a line first. [Back to the README.](https://github.com/spxis/rest-in-pieces#readme)

## Starters you can open in the browser

[`examples/`](../examples) holds three small apps (React with Vite, Vue with Vite, and Next.js) that load seeded data, with loading and error states. Each opens in StackBlitz in one click with no account, and the two Vite ones in CodeSandbox:

| Starter | StackBlitz | CodeSandbox |
| ------- | ---------- | ----------- |
| React and Vite | [Open](https://stackblitz.com/github/spxis/rest-in-pieces/tree/main/examples/react-vite) | [Open](https://codesandbox.io/s/github/spxis/rest-in-pieces/tree/main/examples/react-vite) |
| Vue and Vite | [Open](https://stackblitz.com/github/spxis/rest-in-pieces/tree/main/examples/vue-vite) | [Open](https://codesandbox.io/s/github/spxis/rest-in-pieces/tree/main/examples/vue-vite) |
| Next.js | [Open](https://stackblitz.com/github/spxis/rest-in-pieces/tree/main/examples/nextjs) | needs a server; use StackBlitz |

The links open the `main` branch of the repository, so they work from the release that adds `examples/`. The Vite starters add one line to `vite.config.js`, `plugins: [restInPieces()]`, and fetch `/api/users`; the Next.js starter answers `/api/*` from one route handler with `createApp()`. They install the package from npm and are not part of the workspace: copy a folder and it is yours.

## Postman

Every route as a request, made from the OpenAPI document: [`collections/postman/rest-in-pieces.postman_collection.json`](../collections/postman/rest-in-pieces.postman_collection.json) (Postman v2.1).

1. In Postman choose **Import**, then **Link**, and paste `https://spxis.github.io/rest-in-pieces/collections/rest-in-pieces.postman_collection.json` (or drop the file in).
2. Start the API: `npx @johnmorrisdotca/rest-in-pieces`. The collection's `baseUrl` variable is `http://localhost:6800`; change it to point at another copy.
3. Send a request. `limit` and `seed` are on; every other parameter is listed, off, with its description and an example, so switch on what you need. A request with a body has a seeded example body. Sign in with **Auth > Sign in** and put the access token in the `token` variable for the one route that needs it.

Postman's own "Run in Postman" button points at a collection published to a Postman workspace, which needs a Postman account, so there is none here: the link import above needs no account. Postman can also import the OpenAPI document directly (**Import > Link**, `https://spxis.github.io/rest-in-pieces/api/openapi.json`), as can Insomnia, Hoppscotch and Scalar.

## Bruno

[`collections/bruno/`](../collections/bruno) is the same set as a Bruno collection: a folder per tag, one `.bru` file per request, and a `Local` environment with `baseUrl`. Clone or download the repository, then in Bruno choose **Open Collection** and pick that folder, choose the **Local** environment, and send. Bruno can also import the OpenAPI document (**Import Collection > OpenAPI**).

## Keeping them current

Both are written from the API's own OpenAPI document by `scripts/collections.ts`, with nothing random in them and no version number, so they change only when a route or a parameter does:

```sh
pnpm collections     # rewrites collections/
```

`apps/api/test/collections-files.test.ts` fails when the committed files are not what the generator makes now, and checks that every operation is in both collections once, that each request starts at `{{baseUrl}}`, that every path variable is defined and that every body is JSON. The GitHub Pages build copies the Postman file to `collections/` so the import link above works.
