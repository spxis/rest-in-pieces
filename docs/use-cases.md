# Use cases

Eleven jobs REST in Pieces does, each with the problem in plain words and the request that solves it. [Back to the README](https://github.com/spxis/rest-in-pieces#readme).

Every one of these has a live, animated version on the **[use cases page of the demo](https://spxis.github.io/rest-in-pieces/use-cases/)**, in English and 日本語. The animations are not recordings: each sends the requests written here to the API running inside the page and draws what comes back. The requests below are written for `http://localhost:6800`, where `npx @johnmorrisdotca/rest-in-pieces` serves.

1. [Build a front end before the backend exists](#1-build-a-front-end-before-the-backend-exists)
2. [A tutorial API that takes writes too](#2-a-tutorial-api-that-takes-writes-too)
3. [Loading, error and empty states](#3-loading-error-and-empty-states)
4. [Data that breaks layouts](#4-data-that-breaks-layouts)
5. [Practise sign-in](#5-practise-sign-in)
6. [Repeatable data for tests](#6-repeatable-data-for-tests)
7. [Seed a database offline](#7-seed-a-database-offline)
8. [Mock shapes from your own schema](#8-mock-shapes-from-your-own-schema)
9. [Test an international app](#9-test-an-international-app)
10. [Healthcare and fintech prototypes](#10-healthcare-and-fintech-prototypes)
11. [Country, region and flag pickers](#11-country-region-and-flag-pickers)

## 1. Build a front end before the backend exists

**The problem.** The design is done and the backend is weeks away, so the table has nothing to show.

**The fix.** Point `fetch` at REST in Pieces. A list arrives with realistic names, emails and cities, and an order arrives with its buyer and its products already joined, so the screen that shows an order needs one request. When the real backend is ready, change one base URL.

```js
const BASE = 'http://localhost:6800'; // later: your real backend's address

const { results: people } = await (await fetch(`${BASE}/users?limit=5&seed=7&safe=true`)).json();
const order = await (await fetch(`${BASE}/orders/4?expand=user,items.product&safe=true`)).json();
// order.user is the buyer, order.items[0].product the product
```

Safe values, the default since 3.0 (the `safe=true` above is only to say so), write emails at `example.com`, so a screenshot or a demo never shows an address that could belong to someone. The order's lines add up and its tax is the buyer's local rate. See [Relations](https://github.com/spxis/rest-in-pieces#relations).

## 2. A tutorial API that takes writes too

**The problem.** You are following, or writing, a JSONPlaceholder tutorial and want the `POST` to work as well as the reads.

**The fix.** `/jsonplaceholder` answers with JSONPlaceholder's defaults (bare arrays, its field names), so a tutorial works by changing its base URL. A `POST` answers `201` with the new post and its id. Nothing is kept unless the server is started with `--session`, as on JSONPlaceholder itself; with the session on, a later `GET` sees the post.

```js
const BASE = 'http://localhost:6800/jsonplaceholder'; // was https://jsonplaceholder.typicode.com

const post = await (await fetch(`${BASE}/posts/1`)).json();
const created = await fetch(`${BASE}/posts`, {
  method: 'POST',
  body: JSON.stringify({ title: 'foo', body: 'bar', userId: 1 }),
  headers: { 'Content-type': 'application/json; charset=UTF-8' },
}); // 201, with the post and its new id
```

```sh
curl -X POST 'http://localhost:6800/jsonplaceholder/posts' -H 'Content-Type: application/json' -d '{"title":"foo","body":"bar","userId":1}'
npx @johnmorrisdotca/rest-in-pieces --session   # keep writes, so a later GET sees the post
```

See [A JSONPlaceholder tutorial with a new base URL](https://github.com/spxis/rest-in-pieces#a-jsonplaceholder-tutorial-with-a-new-base-url) and [Writes, sessions and sign-in](https://github.com/spxis/rest-in-pieces/blob/main/docs/writes-sessions-auth.md).

## 3. Loading, error and empty states

**The problem.** Your spinner, error banner and empty screen never show, because the backend is always fast and always up.

**The fix.** Four query parameters rehearse them without touching your client:

```sh
# slow, then a body that arrives in pieces 200 ms apart
curl -N 'http://localhost:6800/users?limit=3&seed=1&safe=true&delay=600&trickle=200'

# flaky: about three in ten requests fail with a 500, at random
curl -i 'http://localhost:6800/users?limit=1&seed=1&safe=true&fail=0.3'

# down: always 503, with Retry-After
curl -i 'http://localhost:6800/users?limit=1&status=503'

# empty: a search that matches nothing
curl 'http://localhost:6800/users?limit=3&q=zzzz'
```

`delay=200-800` picks a wait inside the range from the request, so the same URL waits the same time everywhere. `fail=0.3` is the one parameter that is random per request, which is the point of a flaky backend: `status=500` fails every time and `fail=0.3` about three requests in ten. Simulated answers carry `X-Simulated: true`, and `429` and `503` carry `Retry-After`. See [Query parameters](https://github.com/spxis/rest-in-pieces#query-parameters).

## 4. Data that breaks layouts

**The problem.** Cards look perfect with tidy sample names, until a very long company name, a missing city or a right-to-left surname breaks the page.

**The fix.** `messy` rewrites a share of the values into the ones that break layouts: nulls and missing keys, blank and whitespace-only strings, very long strings, emoji, right-to-left text, stray spaces, and edge numbers and dates. The same seed gives the same mess, so a bug can be shared as a URL.

```js
// the same seed, tidy and then messy
const tidy = await (await fetch('http://localhost:6800/users?limit=4&seed=9')).json();
const messy = await (await fetch('http://localhost:6800/users?limit=4&seed=9&messy=0.3')).json();
```

`messy=true` rewrites about 15% of values and `messy=0.5` half of them. Values keep their type, but any field except the id may be null or missing, which is the case a typed client most often forgets.

## 5. Practise sign-in

**The problem.** You are building a login form, a protected page and a "session expired" screen, and there is no auth server.

**The fix.** Sign in as `admin` with the password `password` for a token that lives as long as you say, call a protected route with it, and watch it expire.

```js
const login = await (await fetch('http://localhost:6800/auth/login?expiresIn=4s', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password: 'password' }),
})).json();

const headers = { Authorization: `Bearer ${login.accessToken}` };
await fetch('http://localhost:6800/users?auth=admin&limit=1', { headers }); // 200 now, 401 token_expired after 4 s

await fetch('http://localhost:6800/auth/refresh?expiresIn=4s', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ refreshToken: login.refreshToken }),
});
```

`?auth=required`, `?auth=editor` and `?auth=admin` turn any request into a protected one, with real `401` and `403` answers. `expiresIn=0` gives a token that is already expired, to rehearse the refresh path at once. **These are fake tokens for frontends, not security:** every password is `password`. See [Sign-in](https://github.com/spxis/rest-in-pieces/blob/main/docs/writes-sessions-auth.md#sign-in-fake-auth).

## 6. Repeatable data for tests

**The problem.** Your Playwright, Cypress or Storybook snapshot fails because the sample data changed between runs.

**The fix.** The same seed gives the same records on every machine and every run, and another seed gives another set. Pin the seed in the test and the snapshot stays put.

```ts
import { createApp } from '@johnmorrisdotca/rest-in-pieces';
import { expect, test } from '@playwright/test';

const app = createApp();

test('the people table matches its snapshot', async ({ page }) => {
  await page.route('**/api/names**', (route) => app.request('/names?limit=4&seed=42').then(async (res) =>
    route.fulfill({ status: res.status, contentType: 'application/json', body: await res.text() })));
  await page.goto('/people');
  await expect(page.getByRole('table')).toHaveScreenshot();
});
```

```sh
curl 'http://localhost:6800/names?limit=4&seed=42'   # the same four people on every machine
curl 'http://localhost:6800/names?limit=4&seed=43'   # a different four
```

Setups for [Playwright, Cypress and Storybook](https://github.com/spxis/rest-in-pieces/blob/main/docs/use-with.md) are in Use with.

## 7. Seed a database offline

**The problem.** You need a thousand realistic rows in a development database, without writing a script or calling a service.

**The fix.** `format=sql` writes one `INSERT` per record and `format=ndjson` one JSON record per line, from the API or from the `generate` command, which needs no server at all. The same seed writes the same rows.

```sh
npx @johnmorrisdotca/rest-in-pieces generate \
  --fields 'id:string.uuid,name:person.fullName,email:internet.email' \
  --count 1000 --seed 1 --format sql --table people > people.sql

curl 'http://localhost:6800/todos?limit=3&seed=1&format=sql&table=todos' > todos.sql
curl 'http://localhost:6800/todos?limit=3&seed=1&format=ndjson' > todos.ndjson
```

The SQL is dialect-neutral (double-quoted identifiers, `TRUE` and `FALSE`, `NULL`) and writes no `CREATE TABLE`. See [Formats](https://github.com/spxis/rest-in-pieces#formats-ndjson-and-sql) and [the offline generator](https://github.com/spxis/rest-in-pieces/blob/main/docs/offline-generator.md).

## 8. Mock shapes from your own schema

**The problem.** The records you need are not people or products. They are whatever your JSON Schema or OpenAPI file says.

**The fix.** `POST` the schema to `/generate` and get records that satisfy it. Patterns, enums, formats and number bounds are honoured, and the same seed gives the same rows.

```sh
curl -X POST 'http://localhost:6800/generate?limit=4' \
  -H 'Content-Type: application/json' \
  -d '{"seed":4,"schema":{"type":"object","required":["sku","status","price","contact"],"properties":{"sku":{"type":"string","pattern":"^[A-Z]{3}-[0-9]{4}$"},"status":{"enum":["draft","live","retired"]},"price":{"type":"number","minimum":5,"maximum":500},"contact":{"type":"string","format":"email"}}}}'

npx @johnmorrisdotca/rest-in-pieces generate --schema openapi.yaml --component Pet --count 1000 --format ndjson
```

A keyword it cannot honour is a `400` that names it. See [schema generation](https://github.com/spxis/rest-in-pieces/blob/main/docs/schema-generation.md).

## 9. Test an international app

**The problem.** You test with English names only, so a Japanese name order, a French phone format or an unfamiliar city is a surprise in production.

**The fix.** `locale` writes every record in that country's own form: names, addresses, postal codes and phone numbers. `locale=global` mixes the countries in one table, the way a real international user table looks, and still repeats for the same seed.

```sh
curl 'http://localhost:6800/users?limit=4&seed=7&locale=en-CA'
curl 'http://localhost:6800/users?limit=4&seed=7&locale=ja'
curl 'http://localhost:6800/users?limit=4&seed=7&locale=fr-CA'
curl 'http://localhost:6800/users?limit=4&seed=7&locale=global'
```

There are fifteen locales and the global mix; Japanese is hand-built, with kanji names, katakana readings, prefectures, 〒 postal codes and mobile numbers. Field names never change with the locale. See [Data locales](https://github.com/spxis/rest-in-pieces#data-locales).

## 10. Healthcare and fintech prototypes

**The problem.** You are prototyping a patient portal or a billing screen and cannot use real records, but the data has to agree with itself.

**The fix.** Synthetic patients in the shape of FHIR R4, invoices whose lines add up, and transactions that post after they happen.

```sh
curl 'http://localhost:6800/patients?limit=1&seed=1'
curl 'http://localhost:6800/invoices?limit=1&seed=2'
curl 'http://localhost:6800/transactions?limit=4&seed=2'
```

**Everything here is invented.** No patient, invoice or transaction comes from, is learned from or is anonymised from a real person or record. It is **not de-identified data**, because it was never identified data, and it claims no statistical resemblance to any population. Every patient carries a `synthetic` tag, contact details are always of the kind nobody answers, and the clinical codes are this project's own, not SNOMED CT, LOINC, ICD or CPT. It is for building and testing software, never for research or clinical use. See [Synthetic patients](https://github.com/spxis/rest-in-pieces/blob/main/docs/synthetic-patients.md) for the whole disclaimer and [Domains](https://github.com/spxis/rest-in-pieces/blob/main/docs/domains.md) for invoices and transactions.

## 11. Country, region and flag pickers

**The problem.** Your sign-up form needs a country select that fills a state or province select, with the flag and a map of the place beside them, and a made-up list of places is a bug waiting to be shipped.

**The fix.** Countries, their states, provinces and prefectures, and the groups they belong to are real data in English and Japanese. A record carries the address of its flag, `/maps` draws the place, and a person's `province` links to its region.

```sh
# the country select: the G7, as countries with a flag emoji and a name in either language
curl 'http://localhost:6800/groupings/g7/countries?limit=7'
# the region select, once Canada is chosen
curl 'http://localhost:6800/countries/CA/subdivisions?limit=10&sortBy=code'
# the place: its names, capital, population and the address of its flag
curl 'http://localhost:6800/subdivisions/CA-ON'
curl 'http://localhost:6800/maps/CA-ON.svg?color=2f6b4f' > ontario.svg
curl 'http://localhost:6800/flags/ca-on.svg' -L > ontario-flag.svg
# a person's province, as its ISO 3166-2 record
curl 'http://localhost:6800/names?limit=2&seed=1&expand=subdivision'
```

Every option, name and figure is real reference data, so the lists are right the day the form ships; the people the forms are tested with are still invented. For a page with no server, `fetch` the [static API](https://github.com/spxis/rest-in-pieces/blob/main/docs/static-api.md): `api/countries.json`, `api/countries/CA/subdivisions.json` and `api/subdivisions/CA-ON.json` hold the same lists, and the CSV beside each reads in a spreadsheet. See [Real places, invented people](https://github.com/spxis/rest-in-pieces/blob/main/docs/reference-data.md).
