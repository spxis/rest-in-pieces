# Changelog

Notable user-facing changes are recorded here. The project follows [Semantic Versioning](https://semver.org/).

## Unreleased

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
