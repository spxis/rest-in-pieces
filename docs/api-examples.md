# Current API examples and reference

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
curl 'http://localhost:6800/users?locale=global&limit=20'

# One user's orders, with the buyer and every product embedded
curl 'http://localhost:6800/users/2/orders?expand=user,items.product'

# A post's comments, and a product's reviews with their authors
curl 'http://localhost:6800/posts/1/comments'
curl 'http://localhost:6800/products/3/reviews?expand=user'

# Safe values are the default: example-domain emails, fiction-range phones, self-hosted avatars
curl 'http://localhost:6800/users?limit=5'

# Seed a database: SQL INSERT statements, or NDJSON for a bulk loader
curl 'http://localhost:6800/orders?limit=1000&format=sql&table=orders' > orders.sql
curl 'http://localhost:6800/todos?limit=1000&format=ndjson' > todos.ndjson

# Your own shape
curl 'http://localhost:6800/generate?fields=name:person.fullName,email:internet.email,plan:commerce.productAdjective&seed=3'
curl 'http://localhost:6800/generate?fields=age:number.int(18,65),status:pick(active,paused,closed|70,20,10),nickname:person.firstName?blank=15'
curl -X POST 'http://localhost:6800/generate?limit=5' \
  -H 'Content-Type: application/json' \
  -d '{ "fields": { "sku": "string.uuid", "price": "commerce.price" }, "count": 200, "seed": 9 }'

# Sign in, then call a protected route
curl -X POST 'http://localhost:6800/auth/login' -H 'Content-Type: application/json' -d '{ "username": "admin", "password": "password" }'
curl -i 'http://localhost:6800/users?auth=admin' -H 'Authorization: Bearer <accessToken>'

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
| `GET /countries`           | Every country and territory: ISO codes, names in English and Japanese, currencies, languages, calling codes, capital, time zones, population, area, borders. Real data from [Kuni](https://github.com/johnmorrisdotca/kuni), with a country's `/subdivisions` and `/groupings` under it. See [Real places, invented people](#real-places-invented-people). |
| `GET /subdivisions` | The 5,050 states, provinces, prefectures, counties and Länder of 200 countries (ISO 3166-2): code, kind, level, parent, names in English and Japanese, capital, population, area, coordinates. `/countries/{code}/subdivisions` lists one country's, and `expand=subdivision` on `/names` links a person's province. |
| `GET /groupings` | 107 groupings of countries (the EU, the G7, ASEAN, continents, UN regions) and of subdivisions (Japan's 地方), with members, the dates they joined, and the definition each follows. `/groupings/{id}/countries`, `/countries/{code}/groupings`. |
| `GET /addresses` | Addresses in the US, Canada, Japan, Australia, the UK, France and Germany, each in its country's own postal format, with a postcode that exists in its region; `/addresses/validate` and `/addresses/format` check and write one you give. See [Addresses](https://github.com/spxis/rest-in-pieces/blob/main/docs/reference-data.md#addresses-addresses). |
| `GET /flags/{code}.svg`, `/maps/{code}.svg` | A flag (`jp`, `jp-13`, `CA-ON`; `?shape=round`, `?fit=whole`) and a map (`JP`, `JP-13`; `?capital=true`, `?color=2f6b4f`, `?features=water`) as SVG, like `/avatars`. Maps need `npm install @johnmorrisdotca/chizu` (an optional peer dependency, like Hata; the Docker image has it). A record's `flag` is the same flag's address on the CDN. See [Flags and maps](https://github.com/spxis/rest-in-pieces/blob/main/docs/reference-data.md#flags-and-maps). |
| `GET /geo/features` | About 2,800 named seas, lakes, rivers, deserts, ranges and peaks from [Chizu](https://github.com/johnmorrisdotca/chizu): `kind`, names in English and Japanese, a point and a box (no shapes), the `countries` whose map holds it, its Wikidata item. `?kind=lake&countries=JP`, `?q=琵琶`; a `map` link lights it. Needs Chizu (`501` without it). |
| `GET /countries/withdrawn` | The 31 countries ISO 3166-3 withdrew (`SU`, `YU`, `CS`, `DD`, `ZR`…), with the codes they held, the years, and the countries that came after. |
| `GET /orders`              | Orders with their line items, joined to `/users` by `userId` and each item to `/products` by `productId`, totals and tax in the buyer's currency. See [Relations](#relations). |
| `GET /posts`               | Blog posts by users, in JSONPlaceholder's shape plus `createdAt`. |
| `GET /comments`            | Comments on posts, each by a user who is not the post's author. |
| `GET /todos`               | To-do items, each owned by a user, with an optional `dueOn`. |
| `GET /reviews`             | Product reviews by users, rated close to the product's own `rating`. |
| `GET /invoices`, `/transactions`, `/events`, `/messages`, `/notifications`, `/jobs`, `/places` | More domains, each record agreeing with itself: invoices that add up with dates in order, transactions that post after they happen, events that end after they start, replies after their messages, jobs with salary ranges, places within 15 km of their city with GeoJSON. See [docs/domains.md](https://github.com/spxis/rest-in-pieces/blob/main/docs/domains.md). |
| `GET /metrics`, `/logs`   | Time series and log lines that are a pure function of the seed and the index, with incidents to find. See [docs/domains.md](https://github.com/spxis/rest-in-pieces/blob/main/docs/domains.md#time-series-a-pure-function-of-the-seed-and-the-index). |
| `GET /patients`, `/observations`, `/conditions`, `/encounters` | **Synthetic** patients in the shape of FHIR R4, each resource agreeing with its patient (born, alive, old enough). Invented, not de-identified data and not coded with SNOMED, LOINC, ICD or CPT. See [docs/synthetic-patients.md](https://github.com/spxis/rest-in-pieces/blob/main/docs/synthetic-patients.md). |
| `GET /fhir/{type}`, `/fhir/{type}/{id}`, `/fhir/metadata` | The same synthetic data as a FHIR searchset Bundle, a resource or a CapabilityStatement, with a few search parameters and `OperationOutcome` errors. |
| `GET /{dataset}/{id}`      | One record: `/names/0`, `/users/1`, `/countries/CA` or `/countries/CAN`. `/orders/{id}` carries its items. |
| `GET /users/{id}/orders`, `/users/{id}/posts`, `/users/{id}/todos`, `/posts/{id}/comments`, `/products/{id}/reviews` | One record's children, with every list parameter. `404` for a parent that does not exist. |
| `GET /avatars/{seed}.svg`  | A deterministic SVG avatar; `?name=` puts initials on it. See [Images](#images-avatars-and-placeholders). |
| `GET /images/{w}x{h}.svg`  | A placeholder image of that size; `?text=`, `?bg=` and `?fg=` change it. |
| `/jsonplaceholder/...`     | The same data with JSONPlaceholder's defaults. See [the recipe](#a-jsonplaceholder-tutorial-with-a-new-base-url). |
| `POST /{dataset}`          | Validates a new record and answers `201` with it, as it would have been created. See [Writes](#writes). |
| `PUT`, `PATCH`, `DELETE /{dataset}/{id}` | Replace, update or delete a record: `200` with the result, or `204` for a delete. Nothing is stored unless the [session](#sessions-keeping-writes) is on. |
| `POST /auth/login`         | Sign in with a username or email from `/users` and the password `password`: an access token, a refresh token and the user with their role. See [Sign-in](#sign-in-fake-auth). |
| `POST /auth/refresh`, `GET /auth/me`, `POST /auth/logout` | A new pair of tokens; the signed-in user; sign out. |
| `GET /session`             | Whether writes are kept, the limits, and every dataset a write has changed. |
| `POST /reset`              | Puts the seeded data back: every change, or one dataset's with `?dataset=users`. Harmless when the session is off. |
| `GET /generate`            | Records from a field list, e.g. `fields=name:person.fullName,email:internet.email`. |
| `POST /generate`           | The same, with the fields, `count` and `seed` in a JSON body, or a JSON Schema or OpenAPI schema to generate from. |
| `GET /generators`          | Every generator type, flat and grouped by module, and the arguments of those that take them. |
| `GET /streams/{name}`      | Server-Sent Events playing `messages`, `notifications`, `metrics` or `logs` one record at a time. See [Live streams](#live-streams). |
| `GET /resources`           | The datasets and their fields, per locale, with what each can `expand` and list under a record. |
| `GET /locales`             | The data locales, with their names, BCP 47 tag, country, currency and the tax rate orders use. |
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
| `max`           | every record | Caps the dataset, to test the last page and end-of-data handling. Every record is 1000, or more after creates with the session on. Alias: `maxRecords`. |
| `sortBy`        | none      | Field to sort by. Append `:numeric` to compare as numbers, e.g. `age:numeric`. |
| `sortDirection` | `asc`     | `desc` (also `descending`, `reverse`, `rev`, `backwards`, `-1`). Alias: `sortOrder`. |
| `q`             | none      | Case-insensitive search across every field. |
| *field name*    | none      | Filters: `gender=female`, `province=Ontario,Quebec`, `age[gte]=30`. Operators: `eq`, `ne`, `gt`, `gte`, `lt`, `lte`. |
| `seed`          | `1`       | Selects a repeatable dataset. |
| `locale`        | `en-CA`   | Which country the data is written for, or `global` for a mix. See [Data locales](#data-locales). |
| `messy`         | off       | Rewrites a share of values into the ones that break layouts: null and missing keys, empty and whitespace-only strings, very long strings (120 characters, 2,000 for descriptions), emoji, combining marks and zero-width joiners, right-to-left text, leading and trailing whitespace, edge numbers (0, negative, very large, many decimals) and edge dates (the epoch, the far future, 29 February). `true` rewrites about 15%; `0.5` sets the share. The same `seed` gives the same mess, so a bug can be shared by URL. Values keep their type, but any field except the id may be null or missing. Also on `/{dataset}/{id}`. |
| `metadata`      | on        | `false` returns the bare array. `/countries` defaults to off for compatibility. |
| `resultsName`   | `results` | Renames the results key, e.g. `rows`. |
| `format`        | `json`    | `csv`, `yaml`, `xml`, `ndjson` or `sql`. The `Accept` header works too (`text/csv`, `application/x-ndjson`, `application/sql`). CSV, NDJSON and SQL hold the page's records without the metadata. See [Formats](#formats-ndjson-and-sql). |
| `table`         | the dataset | With `format=sql`, the table the `INSERT` statements name: a letter or `_`, then letters, digits or `_`, up to 63 characters; anything else is a `400`. |
| `expand`        | none      | Embeds related records in each record of the page: `expand=user,items.product`. See [Relations](#relations). |
| `safe`          | on        | `true` writes values that cannot reach anybody; `false` writes the 2.x values. On by default since 3.0. See [Safe values](#safe-values). |
| `delay`         | `0`       | Milliseconds to wait before responding, up to 10000. A range such as `200-800` picks a wait inside it from the request, seed included, so the same URL waits the same time on every machine. |
| `trickle`       | `0`       | Sends the headers at once and the body in pieces this many milliseconds apart, in any format, so time to first byte and total time can be told apart. With `delay`, the response still takes no more than 10 s. |
| `status`        | none      | Respond with this status. 4xx and 5xx return a simulated error; 2xx and 3xx override the success status. |
| `fail`          | off       | `true` fails the request with a 500 (or `status`); a fraction such as `0.2` fails that share of requests. |
| `auth`          | off       | Makes the request a protected route: `required` (or `true`) wants any signed-in account, `editor` the editor or admin role, `admin` the admin role. `401` without a valid token, `403` when the role is not enough. Also on items and writes. See [Sign-in](#sign-in-fake-auth). |

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

### Writes

`/names`, `/users`, `/products`, `/companies`, `/orders`, `/posts`, `/comments`, `/todos` and `/reviews` take `POST`, `PUT`, `PATCH` and `DELETE`, so a client can rehearse a form submit, an optimistic update, a delete confirmation and a validation error. **Stateless by default:** unless the session is on, nothing is stored and a write never changes what a later read returns. `delay`, `trickle`, `status` and `fail` work on writes as on reads.

**Full reference with examples: [docs/writes-sessions-auth.md#writes](https://github.com/spxis/rest-in-pieces/blob/main/docs/writes-sessions-auth.md#writes).**

### Sessions: keeping writes

Opt-in, in memory only, with nothing on a timer: `--session`, `REST_IN_PIECES_SESSION=true` or `createApp({ session: true })` keep writes until `POST /reset`, so a test can create, edit and delete and read the result back. Capped at 2,000 records a dataset, 64 changed datasets and 8 MB, answering `507` when full.

**Full reference: [docs/writes-sessions-auth.md#sessions-keeping-writes](https://github.com/spxis/rest-in-pieces/blob/main/docs/writes-sessions-auth.md#sessions-keeping-writes).**

### Sign-in (fake auth)

`POST /auth/login`, `/auth/refresh`, `GET /auth/me` and `POST /auth/logout` over `/users`, roles (`admin`, `editor`, `viewer`, `disabled`), and `?auth=required|editor|admin` on any data endpoint, for rehearsing login forms, protected routes and expired tokens. **Not security:** every password is `password` and the tokens are signed with a published key.

**Full reference: [docs/writes-sessions-auth.md#sign-in-fake-auth](https://github.com/spxis/rest-in-pieces/blob/main/docs/writes-sessions-auth.md#sign-in-fake-auth).**
