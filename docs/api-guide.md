# Using the API

The [current endpoint examples](api-examples.md), [reference datasets](reference-data.md) and [3.x upgrade guide](upgrading-to-3.md) cover the added geographic routes and changed country/safe-value defaults.

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

# Safe values: example-domain emails, fiction-range phones, self-hosted avatars
curl 'http://localhost:6800/users?safe=true&limit=5'

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
| `GET /countries`           | Every country and territory with ISO codes, currencies, languages and calling codes. |
| `GET /orders`              | Orders with their line items, joined to `/users` by `userId` and each item to `/products` by `productId`, totals and tax in the buyer's currency. See [Relations](../README.md#relations). |
| `GET /posts`               | Blog posts by users, in JSONPlaceholder's shape plus `createdAt`. |
| `GET /comments`            | Comments on posts, each by a user who is not the post's author. |
| `GET /todos`               | To-do items, each owned by a user, with an optional `dueOn`. |
| `GET /reviews`             | Product reviews by users, rated close to the product's own `rating`. |
| `GET /{dataset}/{id}`      | One record: `/names/0`, `/users/1`, `/countries/CA` or `/countries/CAN`. `/orders/{id}` carries its items. |
| `GET /users/{id}/orders`, `/users/{id}/posts`, `/users/{id}/todos`, `/posts/{id}/comments`, `/products/{id}/reviews` | One record's children, with every list parameter. `404` for a parent that does not exist. |
| `GET /avatars/{seed}.svg`  | A deterministic SVG avatar; `?name=` puts initials on it. See [Images](../README.md#images-avatars-and-placeholders). |
| `GET /images/{w}x{h}.svg`  | A placeholder image of that size; `?text=`, `?bg=` and `?fg=` change it. |
| `/jsonplaceholder/...`     | The same data with JSONPlaceholder's defaults. See [the recipe](../README.md#a-jsonplaceholder-tutorial-with-a-new-base-url). |
| `POST /{dataset}`          | Validates a new record and answers `201` with it, as it would have been created. See [Writes](#writes). |
| `PUT`, `PATCH`, `DELETE /{dataset}/{id}` | Replace, update or delete a record: `200` with the result, or `204` for a delete. Nothing is stored unless the [session](#sessions-keeping-writes) is on. |
| `POST /auth/login`         | Sign in with a username or email from `/users` and the password `password`: an access token, a refresh token and the user with their role. See [Sign-in](#sign-in-fake-auth). |
| `POST /auth/refresh`, `GET /auth/me`, `POST /auth/logout` | A new pair of tokens; the signed-in user; sign out. |
| `GET /session`             | Whether writes are kept, the limits, and every dataset a write has changed. |
| `POST /reset`              | Puts the seeded data back: every change, or one dataset's with `?dataset=users`. Harmless when the session is off. |
| `GET /generate`            | Records from a field list, e.g. `fields=name:person.fullName,email:internet.email`. |
| `POST /generate`           | The same, with the fields, `count` and `seed` in a JSON body. |
| `GET /generators`          | Every generator type, flat and grouped by module, and the arguments of those that take them. |
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
| `max`           | every record | Caps the dataset, to test the last page and end-of-data handling. Seeded datasets hold 1000 records, or more after creates with the session on; reference datasets keep their full native lists. Alias: `maxRecords`. |
| `sortBy`        | none      | Field to sort by. Append `:numeric` to compare as numbers, e.g. `age:numeric`. |
| `sortDirection` | `asc`     | `desc` (also `descending`, `reverse`, `rev`, `backwards`, `-1`). Alias: `sortOrder`. |
| `q`             | none      | Case-insensitive search across every field. |
| *field name*    | none      | Filters: `gender=female`, `province=Ontario,Quebec`, `age[gte]=30`. Operators: `eq`, `ne`, `gt`, `gte`, `lt`, `lte`. |
| `seed`          | `1`       | Selects a repeatable dataset. |
| `locale`        | `en-CA`   | Which country the data is written for, or `global` for a mix. See [Data locales](../README.md#data-locales). |
| `messy`         | off       | Rewrites a share of values into the ones that break layouts: null and missing keys, empty and whitespace-only strings, very long strings (120 characters, 2,000 for descriptions), emoji, combining marks and zero-width joiners, right-to-left text, leading and trailing whitespace, edge numbers (0, negative, very large, many decimals) and edge dates (the epoch, the far future, 29 February). `true` rewrites about 15%; `0.5` sets the share. The same `seed` gives the same mess, so a bug can be shared by URL. Values keep their type, but any field except the id may be null or missing. Also on `/{dataset}/{id}`. |
| `metadata`      | on        | `false` returns the bare array. `/countries` defaults to off for compatibility. |
| `resultsName`   | `results` | Renames the results key, e.g. `rows`. |
| `format`        | `json`    | `csv`, `yaml`, `xml`, `ndjson` or `sql`. The `Accept` header works too (`text/csv`, `application/x-ndjson`, `application/sql`). CSV, NDJSON and SQL hold the page's records without the metadata. See [Formats](../README.md#formats-ndjson-and-sql). |
| `table`         | the dataset | With `format=sql`, the table the `INSERT` statements name: a letter or `_`, then letters, digits or `_`, up to 63 characters; anything else is a `400`. |
| `expand`        | none      | Embeds related records in each record of the page: `expand=user,items.product`. See [Relations](../README.md#relations). |
| `safe`          | on        | `true` writes values that cannot reach anybody. It is the default from 3.0; `false` selects the earlier 2.x values. See [Safe values](../README.md#safe-values). |
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

`/names`, `/users`, `/products`, `/companies`, `/orders`, `/posts`, `/comments`, `/todos` and `/reviews` take writes, so a client can rehearse a form submit, an optimistic update, a delete confirmation and a validation error:

```sh
# Create: 201, with the next id after the dataset's last, createdAt, updatedAt and a Location header
curl -i -X POST 'http://localhost:6800/users' -H 'Content-Type: application/json' \
  -d '{ "firstName": "Ada", "lastName": "Lovelace", "username": "ada", "email": "ada@example.com",
        "avatar": "https://example.com/ada.png", "phone": "416-555-0100", "jobTitle": "Analyst",
        "company": "Analytical Engines", "city": "Toronto", "country": "CA", "active": true }'

# Update some fields: 200 with the record merged with them
curl -X PATCH 'http://localhost:6800/users/42' -H 'Content-Type: application/json' -d '{ "active": false }'

# Delete: 204
curl -i -X DELETE 'http://localhost:6800/users/42'

# A validation error, a conflict, and a slow failing save
curl -X POST 'http://localhost:6800/users' -H 'Content-Type: application/json' -d '{ "email": "nope" }'
curl -i -X PUT 'http://localhost:6800/users/42?conflict=true' -H 'Content-Type: application/json' -d '{ … }'
curl -i -X PATCH 'http://localhost:6800/users/42?delay=1500&status=503' -H 'Content-Type: application/json' -d '{}'
```

| Request | Answer |
| ------- | ------ |
| `POST /{dataset}` | `201` with the record, the next id (`1001` for users, `1000` for the zero-based `/names`, one past the last for the related datasets), `createdAt` and `updatedAt`, and `Location: /users/1001`. |
| `PUT /{dataset}/{id}` | `200` with the body under the same id, `createdAt` kept and `updatedAt` set. Every field is required. |
| `PATCH /{dataset}/{id}` | `200` with the record merged with the fields sent, and `updatedAt` set. |
| `DELETE /{dataset}/{id}` | `204` with no body. |
| An unknown id | `404`, as the `GET` answers. |
| A body that fails validation | `422` with a message per field: `{ "error": "Validation failed", "fields": { "email": "Invalid email" } }`. A missing field says `Required`; a reference to a record that does not exist says so: `{ "userId": "No user with id 5000." }`. |
| `?conflict=true` | `409`, to rehearse "someone else changed this". |
| Malformed JSON, or no `Content-Type: application/json` | `400` or `415`. Bodies over 64 KB get `413`. |
| A full session | `507` with a message saying which limit, when the [session](#sessions-keeping-writes) is on. |

The body is the record without the fields the server sets (the id and `createdAt`); those are ignored if sent, and so is any field the dataset does not have. The schemas are `PersonInput`, `UserInput`, `ProductInput`, `CompanyInput`, `OrderInput`, `PostInput`, `CommentInput`, `TodoInput` and `ReviewInput` in [`/openapi.json`](#endpoints); a related dataset's references must name records that exist, and an order's prices and totals are worked out by the server (see [Relations](../README.md#relations)). Every record a dataset serves is a valid `PUT` body. `delay`, `trickle`, `status` and `fail` work as they do on reads; on a `PUT`, `PATCH` or `DELETE`, `seed` and `locale` choose the record, as on the `GET`. Writes answer in JSON.

**Stateless by default.** Unless the session is on, nothing is stored: a write never changes what a later read returns, on a shared host or anywhere else, and the response is what the write would have produced. Turn the [session](#sessions-keeping-writes) on to keep writes. `/countries` is real reference data keyed by ISO code, so it stays read-only, as does the deprecated `/random-names` alias.

### Sessions: keeping writes

Off by default, and opt-in wherever the API runs:

| Where | Turn it on |
| ----- | ---------- |
| The command line | `npx @johnmorrisdotca/rest-in-pieces --session`, or `REST_IN_PIECES_SESSION=true` (also in Docker: `-e REST_IN_PIECES_SESSION=true`) |
| In-process | `createApp({ session: true })` |
| The Vite plugin | `restInPieces({ app: { session: true } })` |
| MSW | `restInPiecesHandlers({ http, app: { session: true } })` |
| A browser tab | `installInBrowserApi({ app: { session: true } })` |

```sh
npx @johnmorrisdotca/rest-in-pieces --session

curl -X DELETE 'http://localhost:6800/users/1'                # 204
curl -i 'http://localhost:6800/users/1'                       # 404: it stays deleted
curl 'http://localhost:6800/users?limit=1' | jq .metadata.total   # 999
curl 'http://localhost:6800/session'                          # what the session holds
curl -X POST 'http://localhost:6800/reset'                    # the seed again: 1000 users
```

- **What it keeps.** `POST` adds the record with the next id (ids are never given out twice, even after a delete), `PUT` and `PATCH` replace and merge, `DELETE` removes. Lists, counts, `X-Total-Count`, filters, search, sorting, paging, cursors, `messy` and item routes all see the change, and so does `/auth/me` for a user who was edited, disabled or deleted.
- **Per seed and locale.** A dataset is copied into the session on its first write, at that request's `seed` and `locale`, so `/users?seed=7` and `/users?locale=ja` change apart from `/users`. Everything not written to is still read straight from the seed.
- **`GET /session`** lists every changed dataset with its created, updated and deleted counts and its size, plus the limits. **`POST /reset`** drops every change, or one dataset's with `?dataset=users`, and answers `200` when the session is off too, so a test's `beforeEach` can call it either way.
- **Relations stay whole.** A write must name records that exist: an order's `userId` and every item's `productId`, a comment's `postId` and `userId`, a review's `productId` and `userId`, a post's or todo's `userId`, at the same `seed` and `locale`, or it answers `422` naming the field. A delete takes along every record that points at the one deleted, and theirs in turn: **deleting a user deletes their orders, their posts and every comment on those posts, their todos, and the comments and reviews they wrote**; deleting a post deletes its comments; deleting a product deletes its reviews. Orders keep a product's name and price as they were when it was ordered, the way a shop keeps what it charged, so deleting a product leaves the orders, and `expand=items.product` gives `null` there. The delete makes room for every dataset it changes first, or answers `507` and changes nothing. `GET /session` counts what each dataset lost.
- **Capped.** At most 2,000 records in a dataset of 1,000 (at one seed and locale), and in proportion for a dataset seeded with more (an orders dataset of 1,680 may hold 3,360); 64 changed datasets, counting each seed and locale apart, since one delete can change six; and 8 MB of written records. A write past a limit answers `507 Insufficient Storage` and keeps nothing; `createApp({ session: { records, datasets, bytes } })` moves the limits.
- **Memory only.** Nothing is written to disk and nothing runs on a timer. A restart starts again from the seed, each `createApp()` has a store of its own, and on a serverless host every instance keeps its own copy, so keep it off there. The hosted demos are stateless: the Vercel deployment never turns it on, and the GitHub Pages playground keeps writes only in your tab, and only after you tick **Keep writes in this tab**.

### Sign-in (fake auth)

A login form, protected routes, roles and expired tokens, against realistic answers. **Not security:** every account's password is `password`, and the tokens are HS256 JWTs signed with the published key `rest-in-pieces-not-a-secret`, so anyone can mint one. They are real JWTs only so that a client's own JWT decoding works on them.

```sh
curl -X POST 'http://localhost:6800/auth/login?expiresIn=30s' -H 'Content-Type: application/json' \
  -d '{ "username": "editor", "password": "password" }'
curl 'http://localhost:6800/auth/me' -H 'Authorization: Bearer <accessToken>'
curl -i 'http://localhost:6800/products?auth=admin' -H 'Authorization: Bearer <accessToken>'   # 403 for an editor
```

**Accounts.** Every user of `/users` signs in with their `username` or `email`, at the `seed` and `locale` in the login's query, so the same seed signs in the same person on every machine. The first active user is the `admin`, the second the `editor`, and every other user a `viewer`. Four usernames are shortcuts: `admin`, `editor` and `viewer` sign in as those accounts, and `disabled` names the first account that is not active.

| Request | Answer |
| ------- | ------ |
| `POST /auth/login` `{ "username", "password" }` (or `email`) | `200` with `tokenType: "Bearer"`, `accessToken`, `expiresIn` (seconds), `expiresAt`, `refreshToken`, `refreshExpiresIn` and `user` (the `/users` record plus `role`). |
| A wrong password or unknown user | `401` `{ "error": "Unauthorized", "code": "invalid_credentials", "message": … }` |
| An account that is not active | `403` with `code: "account_disabled"` |
| A missing field | `422` `{ "error": "Validation failed", "fields": { "password": "Required" } }` |
| `POST /auth/refresh` `{ "refreshToken" }` | `200` with a new pair, read again from the user's current record. Tokens are not stored, so an old refresh token works until it expires. |
| `GET /auth/me` with `Authorization: Bearer <accessToken>` | `200` with the user and their role. |
| `POST /auth/logout` | `204`. Signing out is the client forgetting its tokens. |
| No token, a malformed or tampered one, or a refresh token where an access token belongs | `401` with `code` `missing_token` or `invalid_token`, and `WWW-Authenticate: Bearer realm="rest-in-pieces"` (with `error="invalid_token"` and a description for a bad token). |
| An expired token | `401` with `code: "token_expired"`. |
| `?auth=editor` or `?auth=admin` with a role that is not enough | `403` with `code: "insufficient_role"`, `required` and `role`. |

- **Lifetimes.** Access tokens last 15 minutes and refresh tokens 7 days. `?expiresIn=` and `?refreshExpiresIn=` on login and refresh take seconds (`30`) or a unit (`30s`, `5m`, `2h`, `7d`), up to 30 days. `expiresIn=0` gives an access token that has already expired, so the refresh path can be rehearsed at once.
- **Protected routes.** `?auth=required`, `?auth=editor` or `?auth=admin` on any dataset, item, write or `/generate` turns that request into a protected route. Without `auth`, tokens are ignored, as before. A simulated `status` or `fail` still wins, so `?auth=required&status=503` is a `503`.
- **Rehearsable failures too.** `delay`, `status` and `fail` work on `/auth/*`, for a slow or failing sign-in.
- **In the OpenAPI document** as the `Auth` tag and a `bearerAuth` security scheme, so `/docs` can send a token.

