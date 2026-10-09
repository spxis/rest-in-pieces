# REST in Pieces

[![CI](https://github.com/spxis/rest-in-pieces/actions/workflows/ci.yml/badge.svg)](https://github.com/spxis/rest-in-pieces/actions/workflows/ci.yml)
[![Pages](https://github.com/spxis/rest-in-pieces/actions/workflows/pages.yml/badge.svg)](https://spxis.github.io/rest-in-pieces/)
[![npm](https://img.shields.io/npm/v/rest-in-pieces)](https://www.npmjs.com/package/rest-in-pieces)
![Node 24](https://img.shields.io/badge/node-24_LTS-3c873a)
![TypeScript](https://img.shields.io/badge/TypeScript-7-3178c6)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

**Try it: [spxis.github.io/rest-in-pieces](https://spxis.github.io/rest-in-pieces/).** The live demo runs the whole API inside the page, so there is no server behind it and nothing to install.

**A repeatable test backend for frontend development.** Build tables, pagination, sorting, filters, loading states, empty states and error handling against realistic data, before a real backend exists.

[![The REST in Pieces playground](docs/images/playground.png)](https://spxis.github.io/rest-in-pieces/)

Every dataset is generated from a seed. The same URL returns the same records on every machine and after every restart, so a bug can be reproduced from its URL instead of disappearing with a new random dataset.

## Run it

**With npx**, with nothing to clone (Node.js 22.13 or later):

```sh
npx rest-in-pieces                  # API, playground and docs on http://localhost:6800
npx rest-in-pieces --port 6900      # another port; PORT works too
npx rest-in-pieces --host 0.0.0.0   # reachable from other machines and containers
```

**With Docker:**

```sh
docker run --rm -p 6800:6800 ghcr.io/spxis/rest-in-pieces
```

**Inside your tests**, with no port and no server to start. `createApp()` builds the API and `app.request()` answers in-process, in Vitest, Jest, Playwright or any Node script:

```ts
import { createApp } from 'rest-in-pieces';
import { expect, test } from 'vitest';

test('lists five users', async () => {
  const res = await createApp().request('/users?limit=5&seed=42');
  expect(await res.json()).toHaveProperty('results.length', 5);
});
```

`rest-in-pieces/core` exports `createApp` alone, with no Node imports, for workers and other fetch-style hosts.

### A backend inside the tab

`rest-in-pieces/browser` runs the API inside the page, so a frontend on StackBlitz, CodeSandbox or any static host gets a REST backend with no server:

```js
import { installInBrowserApi } from 'rest-in-pieces/browser';

installInBrowserApi(); // answers fetch('/api/...') in this tab; every other request goes to the network

const { results } = await (await fetch('/api/users?limit=10&seed=7')).json();
```

`installInBrowserApi({ base: '/mock' })` moves it, and the function it returns puts the original `fetch` back. The API loads on the first request, so the page pays nothing for it until then. Only `fetch` is answered; libraries built on `XMLHttpRequest` still go to the network.

## Why use it

- **Repeatable data.** `?seed=42` always returns the same records. Screenshots, snapshot tests and bug reports stay stable.
- **Realistic collections.** People, users, products, companies and countries, plus any shape you describe with 239 generator types.
- **Fifteen countries, and a global mix.** `?locale=de`, `?locale=pt-BR` or `?locale=ko` writes every dataset for that country: native names, addresses, postal codes and phone numbers, and prices in the local currency. `?locale=global` mixes them record by record, the way a real international user table looks, and still repeats per seed. See [Data locales](#data-locales).
- **Hand-built Japanese data.** `?locale=ja` gives kanji names with katakana readings, real prefectures and cities, 〒 postal codes, mobile numbers, yen prices and Japanese country names.
- **Everything a list screen needs.** Paging, sorting, field filters with ranges, free-text search, `X-Total-Count` and `Link` headers, and ETags.
- **The unhappy path on demand.** `?delay=1500`, `?status=503` or `?fail=0.2` rehearse slow, failing and flaky backends without touching your client.
- **Any format.** JSON, CSV, YAML or XML, chosen by `?format=` or the `Accept` header.
- **Self-documenting.** An OpenAPI 3.1 spec generated from the same schemas that validate requests, with interactive docs at `/docs`.
- **A playground in English and 日本語.** Build a request, inspect the table, body and headers, page through results, and share the exact setup as a link. The language follows the browser, `?lang=ja` or the toggle in the top bar.

## Quick start

Requires Node.js 22.18 or later (24 LTS recommended) and pnpm.

```sh
pnpm install
pnpm dev
```

| Service    | URL                                                  |
| ---------- | ---------------------------------------------------- |
| API        | [http://localhost:6800](http://localhost:6800)       |
| API docs   | [http://localhost:6800/docs](http://localhost:6800/docs) |
| Playground | [http://localhost:6801](http://localhost:6801)       |

Or run everything from one container, with nothing to install but Docker:

```sh
docker run --rm -p 6800:6800 ghcr.io/spxis/rest-in-pieces   # playground, API and docs on :6800
```

To build the image from your checkout instead:

```sh
docker build -t rest-in-pieces .
docker run --rm -p 6800:6800 rest-in-pieces   # playground, API and docs on :6800
```

## Using the API

```sh
# First page of people, in the original envelope
curl 'http://localhost:6800/names?limit=10'

# Women in their thirties in Ontario, oldest first
curl 'http://localhost:6800/names?gender=female&age[gte]=30&age[lt]=40&province=Ontario&sortBy=age:numeric&sortDirection=desc'

# Page by page number, or follow a cursor from metadata.nextCursor
curl 'http://localhost:6800/users?page=3&pageSize=20'
curl 'http://localhost:6800/users?limit=20&cursor='

# One record
curl 'http://localhost:6800/users/42?seed=7'

# Books under $100 as CSV
curl 'http://localhost:6800/products?department=Books&price[lt]=100&format=csv'

# The same people, for a Japanese audience
curl 'http://localhost:6800/names?locale=ja&province=東京都&limit=5'

# An international user table: every row from its own country
curl 'http://localhost:8080/users?locale=global&limit=20'

# Your own shape
curl 'http://localhost:6800/generate?fields=name:person.fullName,email:internet.email,plan:commerce.productAdjective&seed=3'
curl -X POST 'http://localhost:6800/generate?limit=5' \
  -H 'Content-Type: application/json' \
  -d '{ "fields": { "sku": "string.uuid", "price": "commerce.price" }, "count": 200, "seed": 9 }'

# Data that breaks layouts: nulls, 2,000-character descriptions, emoji, Arabic, edge numbers and dates
curl 'http://localhost:6800/products?messy=true&seed=1'

# A flaky backend: 30% of requests fail
curl -i 'http://localhost:6800/users?fail=0.3'

# Uneven latency, then a body that arrives in pieces 200 ms apart
curl -N 'http://localhost:6800/users?delay=200-800&trickle=200'
```

### Endpoints

| Endpoint                   | Description |
| -------------------------- | ----------- |
| `GET /names`               | People: name, age, address, city, province, postal code, country, gender, written for the `locale` (Canadian by default). The original dataset, also at `/random-names`. |
| `GET /users`               | Application users with profile, avatar, contact details and account status. |
| `GET /products`            | Catalogue products with SKU, department, price in the locale's currency (`currency` is ISO 4217), rating and stock. |
| `GET /companies`           | Companies with industry, website, size, founding year and location. |
| `GET /countries`           | Every country and territory with ISO codes, currencies, languages and calling codes. |
| `GET /{dataset}/{id}`      | One record: `/names/0`, `/users/1`, `/countries/CA` or `/countries/CAN`. |
| `GET /generate`            | Records from a field list, e.g. `fields=name:person.fullName,email:internet.email`. |
| `POST /generate`           | The same, with the fields, `count` and `seed` in a JSON body. |
| `GET /generators`          | Every generator type, flat and grouped by module. |
| `GET /resources`           | The datasets and their fields, per locale. |
| `GET /locales`             | The data locales, with their names, BCP 47 tag, country and currency. |
| `GET /health`              | Status, version and uptime. |
| `GET /docs`, `/openapi.json` | Interactive reference and the OpenAPI 3.1 document. |

### Query parameters

These work on every collection, including `/generate`.

| Parameter       | Default   | Description |
| --------------- | --------- | ----------- |
| `limit`         | `10`      | Records per page, up to 1000. Aliases: `size`, `length`, `pageSize`. |
| `offset`        | `0`       | Records to skip. |
| `page`          | none      | One-based page number in pages of `limit`: `page=3&pageSize=20` is `offset=40&limit=20`. |
| `cursor`        | none      | An opaque cursor from `metadata.nextCursor` or `prevCursor`. Takes precedence over `page` and `offset`; an empty `cursor=` starts on the first page. A cursor used with different filters, sort, `q`, `seed`, `locale`, `messy` or `max` returns `400`. |
| `max`           | `1000`    | Caps the dataset, to test the last page and end-of-data handling. Alias: `maxRecords`. |
| `sortBy`        | none      | Field to sort by. Append `:numeric` to compare as numbers, e.g. `age:numeric`. |
| `sortDirection` | `asc`     | `desc` (also `descending`, `reverse`, `rev`, `backwards`, `-1`). Alias: `sortOrder`. |
| `q`             | none      | Case-insensitive search across every field. |
| *field name*    | none      | Filters: `gender=female`, `province=Ontario,Quebec`, `age[gte]=30`. Operators: `eq`, `ne`, `gt`, `gte`, `lt`, `lte`. |
| `seed`          | `1`       | Selects a repeatable dataset. |
| `locale`        | `en-CA`   | Which country the data is written for, or `global` for a mix. See [Data locales](#data-locales). |
| `messy`         | off       | Rewrites a share of values into the ones that break layouts: null and missing keys, empty and whitespace-only strings, very long strings (120 characters, 2,000 for descriptions), emoji, combining marks and zero-width joiners, right-to-left text, leading and trailing whitespace, edge numbers (0, negative, very large, many decimals) and edge dates (the epoch, the far future, 29 February). `true` rewrites about 15%; `0.5` sets the share. The same `seed` gives the same mess, so a bug can be shared by URL. Values keep their type, but any field except the id may be null or missing. Also on `/{dataset}/{id}`. |
| `metadata`      | on        | `false` returns the bare array. `/countries` defaults to off for compatibility. |
| `resultsName`   | `results` | Renames the results key, e.g. `rows`. |
| `format`        | `json`    | `csv`, `yaml` or `xml`. The `Accept` header works too. |
| `delay`         | `0`       | Milliseconds to wait before responding, up to 10000. A range such as `200-800` picks a wait inside it from the request, seed included, so the same URL waits the same time on every machine. |
| `trickle`       | `0`       | Sends the headers at once and the body in pieces this many milliseconds apart, in any format, so time to first byte and total time can be told apart. With `delay`, the response still takes no more than 10 s. |
| `status`        | none      | Respond with this status. 4xx and 5xx return a simulated error; 2xx and 3xx override the success status. |
| `fail`          | off       | `true` fails the request with a 500 (or `status`); a fraction such as `0.2` fails that share of requests. |

Simulated responses carry `X-Simulated: true`, and 429 and 503 carry `Retry-After`. Simulation never applies to `/health` or the docs.

### Response shape

```json
{
  "metadata": {
    "count": 10,
    "total": 1000,
    "timestamp": "1790618113511",
    "lastUpdated": "2026-09-28T17:55:13.511Z",
    "output": { "results": "results" },
    "version": "2.1.0",
    "parameters": { "size": 10, "offset": 0, "max": 1000, "seed": 1, "locale": "en-CA", "q": null, "sortBy": null, "sortType": "string", "sortDirection": "asc" },
    "links": { "self": "/names?limit=10&offset=0", "first": "…", "last": "…", "prev": null, "next": "/names?limit=10&offset=10" },
    "nextCursor": "MS4xMC4xbWpzZnBiM3JmaQ",
    "prevCursor": null
  },
  "results": [{ "index": 0, "name": "Aaliyah Corkery", "age": 26, "…": "…" }]
}
```

`total` counts the records after filters and `max`. The same numbers are in the `X-Total-Count` and `Link` headers, which are exposed to browsers through CORS.

`links` and the `Link` header page the way the request did: with `offset` and `limit`, with `page` and `pageSize`, or with `cursor`. `nextCursor` is null on the last page and `prevCursor` on the first.

## Data locales

Add `locale` to any dataset, item route or `/generate` call. `GET /locales` lists the same table.

| `locale` | Data for | `country` | `currency` |
| -------- | -------- | --------- | ---------- |
| `en-CA` | English (Canada), the default | `CA` | `CAD` |
| `en-US` | English (United States) | `US` | `USD` |
| `en-IN` | English (India) | `IN` | `INR` |
| `zh-CN` | Chinese (China) | `CN` | `CNY` |
| `pt-BR` | Portuguese (Brazil) | `BR` | `BRL` |
| `en-GB` | English (United Kingdom) | `GB` | `GBP` |
| `ru` | Russian (Russia) | `RU` | `RUB` |
| `de` | German (Germany) | `DE` | `EUR` |
| `id` | Indonesian (Indonesia) | `ID` | `IDR` |
| `ja` | Japanese (Japan), hand-built | `JP` | `JPY` |
| `fr` | French (France) | `FR` | `EUR` |
| `fr-CA` | French (Canada) | `CA` | `CAD` |
| `ko` | Korean (South Korea) | `KR` | `KRW` |
| `es-MX` | Spanish (Mexico) | `MX` | `MXN` |
| `vi` | Vietnamese (Vietnam) | `VN` | `VND` |
| `global` | A mix of all of the above | each record's own | each product's own |

- **Same shape everywhere.** Field names never change with the locale: `province` holds a state, prefecture or region and `postal` a ZIP, PIN or postcode. `country` (ISO 3166-1 alpha-2) on every person, user and company tells a client how to read them, and `currency` on every product says what `price` is in.
- **`global` is a mix, not a blend.** Each record's locale is chosen from the seed, weighted roughly by each country's developer population, so the US, India and China turn up most and the smaller locales less often. A table then holds 古谷 あゆみ, Нонна Журавлева and a German street address side by side, which is where layout bugs live. The same seed always gives the same mix. Japanese records keep their `nameKana` and `nameRomaji`; other records don't have them. Responses for the mix carry no `Content-Language`.
- **Spellings.** `en_US`, `pt-br` and full tags such as `ja-JP` or `de-DE` work too. Anything else is a 400 that lists the choices.
- **Custom data.** `/generate` draws every field from the record's locale. Two extra types, `locale.country` and `locale.currency`, put the record's country and currency in a field, which says where each row of a `global` schema came from. A type the locale has no data for (Russian has no name prefixes) comes back `null`.
- **Country names.** `/countries` names countries in the locale's language from the runtime's CLDR data; English locales and `global` keep the English names.
- **Where Faker falls back.** Every locale but Japanese comes from Faker, which falls back to US English without saying so where a locale lacks data. Canadian and British names and Canadian streets are its US English lists, and Vietnamese streets use English street types (`Toàn Thắng Plain`). Product names, job titles and slogans are English in several locales. `apps/api/test/locales.test.ts` records each of these, so a Faker upgrade that changes one fails a test instead of passing unnoticed.

## Japanese data

Add `locale=ja` to any dataset, item route or `/generate` call. Records keep the same shape and field names, so a client can switch locales without code changes. Japanese records add readings where Japanese forms ask for them.

| Dataset      | What changes with `locale=ja` |
| ------------ | ----------------------------- |
| `/names`     | Family name first (`佐藤 美穂`), plus `nameKana` (`サトウ ミホ`) and `nameRomaji` (`Sato Miho`). Prefectures and real cities, weighted by population, and `123-4567` postal codes. |
| `/users`     | Kanji names with `firstNameKana` and `lastNameKana`, romaji usernames and emails, mobile numbers (`090-1234-5678`) and Japanese job titles. |
| `/products`  | Japanese products and departments, priced in whole yen the way shops write them (`1980`, `2000`), with `currency: "JPY"`. |
| `/companies` | `株式会社` names, industries, slogans, romaji domains and real area codes such as `03` for Tokyo and `06` for Osaka. |
| `/countries` | Country names in Japanese (`カナダ`, `日本`) from the runtime's CLDR data. |
| `/generate`  | Every generator uses Faker's Japanese locale. |

Filters and search work on Japanese text: `/names?locale=ja&province=東京都`. Responses carry `Content-Language`, and `metadata.parameters.locale` records the choice. `gender` stays `male` or `female` in every locale so filters are portable.

### 日本語データ

任意のエンドポイントに `locale=ja` を付けると、日本向けのデータを返します。氏名は姓・名の順で、フリガナ（`nameKana`）とローマ字（`nameRomaji`）付きです。住所は実在の都道府県・市区町村を使用し、郵便番号は `123-4567` 形式、電話番号は `090-1234-5678` 形式、商品の価格は円単位（`1980` や `2000` など）です。同じ `seed` なら、いつでも同じデータが返ります。

```sh
curl 'http://localhost:6800/users?locale=ja&limit=5'
curl 'http://localhost:6800/products?locale=ja&sortBy=price:numeric&format=csv'
```

## Fixtures

The live demo also serves every dataset as static files, written by the API when the site is built, so a plain URL works from `curl`, a `<script>`, a tutorial or a test, with CORS and no server behind it:

```sh
curl https://spxis.github.io/rest-in-pieces/fixtures/users.json             # 1,000 users, seed 1, en-CA
curl https://spxis.github.io/rest-in-pieces/fixtures/ja/products.page-1.csv  # the first 10 Japanese products, as CSV
curl https://spxis.github.io/rest-in-pieces/fixtures/global/names/0.json    # one person from the global mix
```

- **What is there.** Every dataset at seed 1, in every locale and `global`: all its records (`users.json`, `users.csv`: 1,000 records, or every country for `countries`), the first page of 10 (`users.page-1.json`, `users.page-1.csv`), and its first three records in item form (`users/1.json`).
- **Where.** The default locale, `en-CA`, sits at the top of the folder, as it does in the API; every other locale has a folder of its own: `de/users.json`, `global/users.json`.
- **Exactly the API's response.** Each file is what the API returns for the request it names: `users.page-1.json` is `/users?seed=1&locale=en-CA&limit=10`. The `metadata.links` in a JSON list are the API's own paths, which need a running API.
- **Discoverable.** [`fixtures/index.json`](https://spxis.github.io/rest-in-pieces/fixtures/index.json) lists every file with its `url`, size in `bytes`, `contentType`, `dataset`, `locale`, `format`, `kind` (`all`, `page` or `item`) and the `request` it answers.
- **Size.** About 560 files and 31 MB, before Pages compresses them. They are rebuilt with every deploy and never committed. For another seed, a filter or another format, use the API.

## Architecture

```mermaid
flowchart LR
  subgraph web["apps/web · React 19 + Vite 8"]
    UI[Playground] -->|fetch| API
  end
  subgraph api["apps/api · Hono on Node 24"]
    API[Routes] --> SIM[Simulation<br/>delay · trickle · status · fail]
    SIM --> COL[Collection pipeline<br/>filter → sort → max → page]
    COL --> FMT[Formats<br/>JSON · CSV · YAML · XML]
    COL --> DATA[(Seeded datasets<br/>Faker, LRU cache)]
    API --> DOCS[OpenAPI 3.1 + Scalar]
  end
```

- **One pipeline.** Every collection, built-in or generated, goes through the same filter, sort, cap and page steps, so behaviour is identical everywhere.
- **Schemas first.** Routes are declared with Zod through `@hono/zod-openapi`; the OpenAPI document is generated from them and cannot drift from the code.
- **Deterministic by construction.** Datasets depend only on their seed, and the most recently used ones are cached in memory.
- **No build step for the API.** Node runs the TypeScript directly with type stripping.
- **Runs anywhere fetch does.** `createApp()` in `apps/api/src/core.ts` uses only web standards. `app.ts` adds the Node parts (logging and static files), and the GitHub Pages build loads the same app into the browser tab.

```
apps/api     Hono API: routes, collection pipeline, datasets, OpenAPI
apps/web     React playground: components, hooks, request builder
tests/e2e    Playwright tests that drive the playground against the real API
```

## Development

| Script               | What it does |
| -------------------- | ------------ |
| `pnpm dev`           | API on :6800 and playground on :6801, both reloading |
| `pnpm check`         | Lint, typecheck, unit tests and build |
| `pnpm test`          | Unit and component tests (Vitest) |
| `pnpm test:coverage` | API tests with coverage thresholds |
| `pnpm test:e2e`      | Playwright end-to-end tests |
| `pnpm format`        | Apply formatting and safe lint fixes (Biome) |
| `pnpm release <version>` | Set the version, date the changelog, commit and tag; see [Releasing](CONTRIBUTING.md#releasing) |

Set `PORT` to move the API, and `VITE_API_BASE_URL` to point the playground elsewhere. See [CONTRIBUTING.md](CONTRIBUTING.md) for the full workflow.

## Deploying

**Vercel.** Create one project with **Root Directory** `apps/api`. `apps/api/vercel.json` builds the playground into `public/`, so the playground, API and docs share one origin with no extra configuration.

**Docker.** Every release publishes `ghcr.io/spxis/rest-in-pieces` for amd64 and arm64, tagged with its version (such as `:2.2.0`) and `latest`. The image serves everything from port 6800, runs as a non-root user and includes a health check.

**GitHub Pages.** `.github/workflows/pages.yml` publishes the in-browser playground on every push to `main`. `pnpm --filter @rest-in-pieces/web build:pages` builds it locally into `apps/web/dist-pages`: the playground, the API bundled as a chunk it loads on the first request, static copies of `api/openapi.json` and `api/docs/`, and the [fixtures](#fixtures). Set `PAGES_BASE` to serve it from somewhere other than `/rest-in-pieces/`. [CONTRIBUTING.md](CONTRIBUTING.md#previewing-the-github-pages-build) shows how to preview it locally.

## License

MIT © 2014–2026 SPX Interactive Software. Security issues: see [SECURITY.md](SECURITY.md).
