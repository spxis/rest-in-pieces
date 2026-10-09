# Changelog

Notable user-facing changes are recorded here. The project follows [Semantic Versioning](https://semver.org/).

## Unreleased

## 2.14.0 - 2026-10-09

### Added

- Related datasets: `/orders` (with line items), `/posts`, `/comments`, `/todos` and `/reviews`, joined to `/users` and `/products`, and to each other, by ids that always resolve. Who owns what depends on the seed alone, so a relation reads the same in every locale, and one prefix sum per seed turns each parent's seeded count of children into an id range: `/users/{id}/orders`, `/users/{id}/posts`, `/users/{id}/todos`, `/posts/{id}/comments` and `/products/{id}/reviews` cost what a page costs, return exactly what the filter does, and keep paging, sorting, filters, search, formats, `messy`, locales, ETags and the simulation. Order totals add up (each line `quantity × unitPrice`, tax at the buyer's locale's headline rate, in the locale's currency, exact in the currency's smallest unit); dates follow one another (joined, ordered, shipped, delivered; posted, commented; listed, reviewed); review ratings gather around the product's own and their words match their stars; nobody comments on their own post. Japanese posts, comments, todos and reviews are hand-written. The first ten users, posts and products always own at least one child.
- `expand=` embeds related records on lists, items and nested lists (`/orders?expand=user,items.product`, `/comments?expand=post.user`): the page only, two levels deep, six paths and 5,000 embedded records at most, each read exactly as its own route shows it.
- Writes keep relations whole: references must name records that exist (`422` naming the field), and `POST /orders` works out each item's name and price, the totals, the tax and the dates; a `PATCH` of `orderStatus` sets `shippedAt` and `deliveredAt`. With the session on, a delete takes along what points at it: a user's orders, posts and their comments, todos, comments and reviews; a post's comments; a product's reviews. Orders keep what they charged when a product goes, and `expand=items.product` gives `null` there. A delete makes room for every dataset it changes first, or answers `507` and changes nothing.
- `/jsonplaceholder`: the same data with JSONPlaceholder's defaults (bare arrays of 100 posts, 500 comments, 200 todos and 10 users; users with `name`, `address`, `website` and `company`), so a JSONPlaceholder tutorial works by changing its base URL.
- Safe values, opt-in in 2.x with `safe=true`, `--safe`, `REST_IN_PIECES_SAFE=true` or `createApp({ safe: true })`: emails at `example.com`, `example.org` and `example.net`, URLs on those domains, phone numbers from the ranges kept for fiction (555-0100 to 555-0199 in Canada and the US; Ofcom, Bundesnetzagentur and ARCEP drama numbers in the UK, Germany and France; `+1 555-01xx` where a country publishes none), card numbers only from the published test numbers, IP addresses only from the documentation ranges, and avatars from this API's own `/avatars`. It becomes the default in 3.0.
- `/avatars/{seed}.svg` (initials from `?name=`, Japanese family names handled, or a pattern from the seed) and `/images/{w}x{h}.svg` (`?text=`, `?bg=`, `?fg=`): deterministic SVGs drawn from the URL alone, with immutable cache headers. `@johnmorrisdotca/rest-in-pieces/images` exports the functions that draw them.
- `format=ndjson` and `format=sql` (one dialect-neutral `INSERT` per record, into `table=`), also by `Accept`. `@johnmorrisdotca/rest-in-pieces/serialize` exports `toNdjson` and `toSql`.
- `/generate` takes arguments (`age:number.int(18,65)`, `price:commerce.price(5,500,2)`, `date.between(2020-01-01,2025-12-31)`), choices with weights (`status:pick(active,paused,closed|70,20,10)`) and a blank rate (`nickname:person.firstName?blank=15`), bounded, with `422` errors that name the field. `/generators` lists each type's arguments under `parameters`.
- `/locales` gives each locale's `taxRate`; `/resources` says what each dataset can `expand` and list under a record (`nested`).
- The OpenAPI document, the generated types and `/docs` describe all of it: the new datasets and their inputs, the nested routes, `expand`, `safe`, `table`, the `Images` and `Compatibility` tags and the `FieldError` answer.
- Playground: tabs for the new datasets; a Relations section to list one record's children and pick what to embed; Safe values beside the locale; NDJSON and SQL among the formats, with a table name, and among the downloads; an argument box beside each generated field's type; the UI preview draws this API's avatars in the page, so they show on GitHub Pages and offline, gives every card a picture, and has cards of its own for orders, posts, comments, todos and reviews. In English and Japanese.

### Changed

- The session keeps changes to 64 datasets by default (was 16), since one delete can change six, and a dataset seeded with more than 1,000 records may grow in proportion to its size.
- The Vite plugin, the MSW handlers and `installInBrowserApi` send `X-Forwarded-Prefix`, so links the API writes to itself keep the base it is mounted under.
- The live demo's fixtures cover the new datasets: about 1,120 files and 76 MB.

## 2.13.0 - 2026-10-09

### Added

- Sessions: an opt-in in-memory store that keeps writes. With `--session`, `REST_IN_PIECES_SESSION=true`, `createApp({ session: true })`, or `app: { session: true }` in the Vite plugin, the MSW handlers and `installInBrowserApi`, `POST`, `PUT`, `PATCH` and `DELETE` change a copy of the seeded dataset at the request's `seed` and `locale`, and every later read, count, filter, page and item sees the change. `POST /reset` puts the seed back (every dataset, or one with `?dataset=`), and `GET /session` lists what is held. Off by default; capped at 2,000 records a dataset, 16 changed datasets and 8 MB, answering `507` when full; memory only, with no timers and nothing written to disk. The hosted demos stay stateless.
- Sign-in, for rehearsing login forms, protected routes, roles and expired tokens: `POST /auth/login`, `POST /auth/refresh`, `GET /auth/me` and `POST /auth/logout` over the `/users` dataset. The first active user is the admin, the second the editor and everyone else a viewer; `admin`, `editor`, `viewer` and `disabled` are shortcuts, and every password is `password`. Tokens are HS256 JWTs signed with a published key, so they are fake by design. `?auth=required`, `?auth=editor` or `?auth=admin` on any data endpoint answers `401` (`missing_token`, `invalid_token`, `token_expired`, with `WWW-Authenticate`) or `403` (`insufficient_role`), and `expiresIn=0` gives a token that has already expired.
- The OpenAPI document, the generated types and `/docs` describe both: `Auth` and `Session` tags, a `bearerAuth` scheme, `AuthTokens`, `AuthUser`, `AuthError` and `Session` schemas, the `auth` parameter, and the `401`, `403` and `507` answers.
- Playground: a sign-in panel (accounts, token lifetimes, a countdown, `/auth/me`, refresh, sign-out and the decoded claims) with "Protect this request"; a session panel that lists what the API keeps and resets it, and on GitHub Pages keeps writes in your tab when you ask; a UI preview tab that draws the response as an app would, with a loading skeleton, cards, and empty and error states; downloads of the response as JSON, CSV or TXT; copy-as tabs for axios, openapi-fetch, MSW and Vite beside curl and fetch; and dark colours that follow the system, with a switch to pin light or dark. In English and Japanese.

### Changed

- `max` defaults to every record the dataset holds, which is still 1000 unless the session has kept creates.
- `WWW-Authenticate` is exposed to browsers through CORS.

## 2.12.1 - 2026-10-09

### Fixed

- The npm page shows the playground screenshot, and its LICENSE, SECURITY and CONTRIBUTING links open: npm resolved relative links against `apps/api`, where the package is published from.
- npm keywords and description name what the package is searched for by: mock and fake REST API, json-server and JSONPlaceholder alternative, MSW, Vite, Playwright, Cypress, Storybook, OpenAPI, pagination, latency and error simulation.

## 2.12.0 - 2026-10-09

### Added

- `@johnmorrisdotca/rest-in-pieces/msw`: `restInPiecesHandlers({ http })` returns a Mock Service Worker handler that answers everything under `/api` (or `base`) from the whole API, for `setupWorker`, `setupServer`, MSW 3's Vite plugin, Storybook and `@msw/playwright`. Pass MSW's own `http`; it works with MSW 2 and 3, and a handler placed before it still wins. `msw` is an optional peer dependency.
- `@johnmorrisdotca/rest-in-pieces/types` and `@johnmorrisdotca/rest-in-pieces/openapi.json`: the API's OpenAPI 3.1 document and TypeScript types for every path and schema, generated from it by openapi-typescript, so `openapi-fetch` and other typed clients work from the installed package with nothing running.
- `@johnmorrisdotca/rest-in-pieces/vite`: `restInPieces()` serves the whole API from the Vite dev server under `/api` on the app's own origin, with no second process, proxy or entry file. It applies to `vite dev` only, and `?trickle=` still streams. `vite` is an optional peer dependency.
- README: Use with, for Vite (the plugin, `@hono/vite-dev-server` and `server.proxy`), MSW, Storybook, Next.js, Playwright, Cypress and typed clients; How it compares, against json-server, MSW, Mirage, Prism, Mockoon, DummyJSON and JSONPlaceholder, and Faker; and what CORS allows.

### Changed

- The README opens with what the package is in one line, "Seeded, realistic, localized data plus latency, error and messy-data drills, as a REST API, a function call or a patch on `fetch`", and points to the integrations.

## 2.11.0 - 2026-10-09

### Changed

- The package is published as `@johnmorrisdotca/rest-in-pieces`: `npx @johnmorrisdotca/rest-in-pieces` starts it, and imports read `from '@johnmorrisdotca/rest-in-pieces'` (with `/core` and `/browser` under it). The unscoped `rest-in-pieces` on npm stays at 1.0.3 from 2022 and will not be updated.

## 2.10.2 - 2026-10-09

### Fixed

- Releases publish again. The release workflow's first job ran `setup-node` without pnpm installed, which `setup-node` v5 refuses, so 2.10.1 published nothing: no image, no package, no GitHub release. This release carries 2.10.1's changes as well.

## 2.10.1 - 2026-10-09

### Fixed

- Canadian and US postal codes belong to the record's province or state. Faker drew the two separately, so at seed 1 about 92% of `/names` records in `en-CA`, `fr-CA` and `en-US` named one region and carried another's code (a Newfoundland address with Manitoba's `R8M 8G0`). The code now takes its region's prefix from [`@johnmorrisdotca/address-plus`](https://www.npmjs.com/package/@johnmorrisdotca/address-plus), and Canadian codes no longer use the letters Canada Post never does (D, F, I, O, Q and U). Only `postal` changes: every other field at a seed, and every other locale, is the same as before.
- `fixtures/index.json` lists its files at `https://` addresses instead of `http://` ones.

## 2.10.0 - 2026-10-08

### Added

- Writes on `/names`, `/users`, `/products` and `/companies`: `POST` answers `201` with the record, the next id, `createdAt`, `updatedAt` and a `Location` header; `PUT` and `PATCH` answer `200` with the replaced or merged record; `DELETE` answers `204`. An unknown id is `404`, a body that fails validation is `422` with a message per field (`{ "error": "Validation failed", "fields": { "email": "Invalid email" } }`), and `?conflict=true` answers `409`. `delay`, `trickle`, `status` and `fail` apply. Writes are stateless: nothing is stored, so a later read returns the same data. `/countries` and `/random-names` stay read-only.
- The OpenAPI document describes each write's body (`PersonInput`, `UserInput`, `ProductInput`, `CompanyInput`) and its `201`, `200`, `204`, `404`, `409` and `422` answers, and `/resources` says which datasets are `writable`.
- Playground: a method switch on writable datasets, with a record id, a JSON body that starts from a sample, and a conflict switch. The URL, curl and fetch snippets carry the method and body.

### Fixed

- Malformed JSON and a body that is not JSON answer `400` and `415` instead of `500`, on `POST /generate` as well.

## 2.9.0 - 2026-10-08

### Changed

- The live demo is the front door: the README opens with it, the playground's top bar links to the API reference, the fixtures, the npm package and the repository, each scenario offers its share link first, and the page title and description say what the service is.

## 2.8.0 - 2026-10-08

### Added

- Static fixtures on GitHub Pages: every dataset at seed 1, in every locale and `global`, as JSON and CSV (all 1,000 records and the first page of 10) plus a few items, at plain URLs such as `https://spxis.github.io/rest-in-pieces/fixtures/users.json`, with `fixtures/index.json` listing them all. The playground's top bar links to them.

## 2.7.0 - 2026-10-08

### Added

- `messy` on every dataset, item route and `/generate` rewrites a share of values into the ones that break layouts and parsers: null and missing keys, empty and whitespace-only strings, very long strings, emoji, combining marks and zero-width joiners, right-to-left text, leading and trailing whitespace, edge numbers and edge dates. `messy=true` rewrites about 15% of values and `messy=0.5` sets the share. Which values change comes from the seed and each record's position, so the same URL returns the same mess. Values keep their type; any field but the id may be null or missing. `messy` is part of the cursor fingerprint, and `metadata.parameters.messy` echoes the share.
- Playground: a "Messy data" scenario, and a Messy data share under Simulate a response.

## 2.6.0 - 2026-10-08

### Added

- The playground shows its version in the top bar beside the name, and the live demo on GitHub Pages adds the commit it was built from, such as `2.3.0 · abc1234`.

## 2.5.0 - 2026-10-08

### Added

- Fifteen data locales: `en-CA` (still the default), `en-US`, `en-IN`, `zh-CN`, `pt-BR`, `en-GB`, `ru`, `de`, `id`, `ja`, `fr`, `fr-CA`, `ko`, `es-MX` and `vi`. Every dataset and `/generate` writes native names, addresses, postal codes and phone numbers for the locale, prices products in its currency and names countries in its language. Japanese keeps its hand-built data.
- `locale=global`: each record from a locale chosen by the seed, weighted toward the bigger developer populations, with `country` saying which. Same seed, same mix.
- `GET /locales` lists the data locales with their names, BCP 47 tag, country and currency. The OpenAPI `locale` description and `/resources` read the same list.
- `/generate` types `locale.country` and `locale.currency`.
- Playground: the data locale picker reads `/locales`, and a "Global users" scenario switches to the mix.

### Changed

- `Product.currency` is an ISO 4217 string rather than the `CAD` / `JPY` enum.
- Companies carry `country`, like people and users.
- Company domains drop punctuation from the name (`S.A.` no longer leaves `..` in a domain).
- A `/generate` type a locale has no data for returns `null` instead of failing the request.
- `locale` accepts underscore spellings and full tags (`en_US`, `de-DE`).
- Responses for `locale=global` carry no `Content-Language`, since they mix languages.

## 2.4.0 - 2026-10-08

### Added

- An npm package. `npx rest-in-pieces` starts the API, playground and docs on port 6800 (`--port` and `--host` change it). The package also exports the app for tests that need no server (`import { createApp } from 'rest-in-pieces'`, then `app.request(...)`), and `rest-in-pieces/browser`, which answers `fetch` calls inside a browser tab so a frontend on StackBlitz or CodeSandbox gets a backend with no server.
- `delay` takes a range, such as `delay=200-800`: the wait is chosen from the request and its seed, so a shared URL waits the same time on every machine.
- `trickle=<ms>` sends the headers at once and the body in pieces that far apart, in every format, to test time-to-first-byte and total-time handling separately. `delay` and `trickle` together stay within the 10 s ceiling.

## 2.3.0 - 2026-10-08

### Added

- Page and cursor paging on every collection and `/generate`. `page` (one-based) and `pageSize` are aliases of `offset` and `limit`. Every enveloped response carries `metadata.nextCursor` and `prevCursor`; `cursor=` follows one, and a cursor used with different filters, sort, `q`, `seed`, `locale` or `max` returns `400`. `links` and the `Link` header page the same way the request did. The playground has a paging style control for offset, page and cursor.

## 2.2.0 - 2026-10-08

### Added

- A live demo on GitHub Pages. The whole API runs inside the browser tab, with static copies of the OpenAPI document and the reference docs beside it.
- `createApp()` builds the API from web standards alone, so it runs on Node, on any fetch-style host and in a browser.
- Releases publish themselves. `pnpm release <version>` updates the versions and the changelog and tags the release; pushing the tag runs the checks, pushes a multi-architecture image to `ghcr.io/spxis/rest-in-pieces`, publishes to npm and creates the GitHub release from the changelog.

### Changed

- Default ports are back in the project's 6800–6899 block: 6800 for the API (and the Docker image) and 6801 for the playground, which now refuses to start on another port. `AGENTS.md` records the block.

### Fixed

- Sorting no longer depends on the server's locale: strings are compared in the dataset's `locale`, numbers inside text sort as numbers (`item 9` before `item 10`), and `sortDirection=desc` is the exact mirror of `asc`, with equal keys kept in dataset order both ways.
- `format=csv` starts with a UTF-8 byte-order mark, so Excel opens Japanese and other non-ASCII text correctly instead of reading it as Windows-1252.

## 2.1.0 - 2026-09-28

### Added

- The playground speaks Japanese: an English / 日本語 toggle (also `?lang=ja` and the browser's language), and a data locale control that sends `locale=ja`.
- Japanese data: `locale=ja` on every dataset and `/generate`. Kanji names with katakana and romaji readings, prefectures and cities, mobile numbers, yen prices, `株式会社` companies and Japanese country names. Responses carry `Content-Language`.
- `/users`, `/products` and `/companies` datasets.
- Item routes for every dataset: `/names/42`, `/users/1`, `/countries/CA`.
- Field filters (`gender=female`, `age[gte]=30`, `province=Ontario,Quebec`) and `q` text search.
- `X-Total-Count` and `Link` headers, `metadata.links`, and ETags for conditional requests.
- `POST /generate` with a JSON body; `/generate` now offers 237 generator types and the same envelope as other collections.
- `/resources` for dataset discovery; `/health` reports the version.
- `fail` accepts a failure rate such as `0.2`; simulated responses carry `X-Simulated` and, for 429 and 503, `Retry-After`.
- Playground: every dataset, a table view with paging, search and filters, curl and fetch snippets, more scenarios, keyboard sending, and cancellation of superseded requests.
- The API serves the playground from the same origin when it has been built, including on Vercel and in Docker.

### Changed

- The OpenAPI document is generated from the request schemas and served with Scalar.
- Default ports are 8080 (API) and 5173 (playground).
- Upgraded the playground to Vite 8, `@vitejs/plugin-react` 6, lucide 1 and TypeScript 7; removed the unused Tailwind dependency.

### Fixed

- XML for bare arrays had several root elements; arrays are now wrapped as `<item>` lists and element names are made valid.
- `status` values outside 200–599 were clamped to 599; they are now ignored.
- `delay`, `status` and `fail` no longer affect `/health`, `/docs` or `/openapi.json`.
- An unsupported `format` is rejected before any work is done.

## 2.0.0 - 2026-09-27

- Rewrote the service in TypeScript on Hono, keeping every URL and query parameter.
- Added seeded data, response formats, failure simulation, a browser playground, and Docker and Vercel configurations.
