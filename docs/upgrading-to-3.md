# Upgrading to 3.0

[Back to the README.](https://github.com/spxis/rest-in-pieces#readme)

3.0 changes two things a 2.x project can see: **safe values are on by default**, and **`/countries` is a different, truer list**. Everything else in 3.0 is additive (new datasets, new routes, new fields), and a client that read 2.x's responses still reads them. Each change below says what 2.x did, what 3.0 does, and how to keep the old behaviour.

| Change | Who it affects | Keep 2.x |
| ------ | -------------- | -------- |
| [Safe values are on by default](#1-safe-values-are-on-by-default) | Anyone who reads emails, phone numbers, card numbers, IP addresses, URLs or avatar links in seeded data | `?safe=false`, `--no-safe`, `REST_IN_PIECES_SAFE=false` or `createApp({ safe: false })` |
| [`/countries` is made from Kuni](#2-countries-is-made-from-kuni) | Anyone who reads `/countries` | Not possible: the old list was wrong in the ways listed. `country-data` is still on npm if you need its exact list |
| [`@johnmorrisdotca/kuni` is a dependency, and `country-data` is not](#3-dependencies) | Anyone who installs the package, bundles it, or runs it offline | Nothing to keep; read what changes |
| [Maps need `@johnmorrisdotca/chizu`](#4-maps-need-chizu-to-be-installed) | Anyone who calls `/maps` from `npx` or an install | `npm install @johnmorrisdotca/chizu` |

Node 22.13 or later is still the floor, and the HTTP API keeps its shape: the paging envelope, the filters, the formats, the error body and the status codes are as they were.

## 1. Safe values are on by default

**2.x.** `safe` was off. A request had to say `?safe=true` (or the server `--safe`, `REST_IN_PIECES_SAFE=true`, `createApp({ safe: true })`) to get emails at `example.com`, phone numbers from the ranges kept for fiction, test card numbers, documentation IP addresses and avatars served by the API itself.

**3.0.** `safe` is on for everything that writes people, companies, contact details, payments and addresses: the datasets, `/generate`, the streams, the mock of your own OpenAPI document, the offline `generate` command, the playground and the static API. Nothing real can be mailed, rung or loaded from seeded data unless you say so.

| Before (2.x) | After (3.0) |
| ------------ | ----------- |
| `GET /users?limit=1` → `"email": "aaliyah.bosco68@hotmail.com"`, `"phone": "(551)389-3688 x0018"`, `"avatar": "https://avatars.githubusercontent.com/u/2738759"` | `"email": "aaliyah.bosco68@example.net"`, `"phone": "416-555-0132"` (the fiction range: `555-0100` to `555-0199` in Canada and the US), `"avatar": "http://localhost/avatars/aaliyah.bosco34.svg?name=Aaliyah%20Bosco"` |
| `GET /users?safe=true` | The same as `GET /users` |
| `GET /users?safe=false` | The 2.x values, byte for byte |
| `npx @johnmorrisdotca/rest-in-pieces` | Safe. `--no-safe` writes the 2.x values |
| `npx @johnmorrisdotca/rest-in-pieces --safe` | Still accepted, and now changes nothing |
| `REST_IN_PIECES_SAFE=true` | Still accepted, and now changes nothing |
| `generate --fields email:internet.email --count 30` | Safe. Add `--no-safe` to write the 2.x values |
| `createApp()` | Safe. `createApp({ safe: false })` writes the 2.x values |
| Vite `restInPieces({ app: { safe: true } })`, MSW `restInPiecesHandlers({ http, app: { safe: true } })` | Drop it, or write `safe: false` to keep the 2.x values |

**How to keep the old behaviour**, whichever way you run it:

```sh
curl 'http://localhost:6800/users?safe=false'                 # one request
npx @johnmorrisdotca/rest-in-pieces --no-safe                 # the server
REST_IN_PIECES_SAFE=false npx @johnmorrisdotca/rest-in-pieces # the same, from the environment (also 0, no, off)
npx @johnmorrisdotca/rest-in-pieces generate --fields email:internet.email --count 30 --no-safe
docker run --rm -p 6800:6800 -e REST_IN_PIECES_SAFE=false ghcr.io/spxis/rest-in-pieces
```

```ts
createApp({ safe: false }); // in-process
// vite.config.ts: restInPieces({ app: { safe: false } })
// MSW: restInPiecesHandlers({ http, app: { safe: false } })
```

`safe=false` is the 2.x output exactly: the test suite pins the hashes of the records 2.13.0 served and checks they are still what `safe=false` writes. A request's `?safe=` always wins over the server's setting.

The write responses (`POST`, `PUT`, `PATCH`) return what you sent, as before; safe values change what is generated, not what you store.

If a test of yours compared against a seeded email or phone number, it now sees the safe one: either update the expected value, or ask for `safe=false` in that test.

## 2. `/countries` is made from Kuni

**2.x.** `/countries` came from the npm package `country-data`: 289 records, 29 of them deleted codes and 10 reserved ones, so that `AI`, `BQ`, `BY`, `CS` and `GE` each appeared twice.

**3.0.** `/countries` is the 250 current ISO 3166-1 countries and territories, from [Kuni](https://github.com/johnmorrisdotca/kuni). The nine fields the old list had (`alpha2`, `alpha3`, `name`, `status`, `ioc`, `emoji`, `currencies`, `countryCallingCodes`, `languages`) keep their names, order and types for every code; a test compares them with the old list for all 250. What differs, and what to change:

| What | 2.x | 3.0 | If you depended on it |
| ---- | --- | --- | --------------------- |
| The list | 289 records, including `status: "deleted"` and `"reserved"` | 250, all current | `?status=deleted` finds nothing. The deleted codes are at `/countries/withdrawn` (31 entries, from ISO 3166-3) with `status: "deleted"`, and the reserved ones (`EU`, `UK`, `AC`, `CP`, `DG`, `EA`, `IC`, `TA`) are not served |
| Duplicate codes | `AI`, `BQ`, `BY`, `CS`, `GE` appeared twice | Once each; the old holders are withdrawn entries | `/countries/AI` is Anguilla; `/countries/withdrawn/AI` is the French Territory of the Afars and Issas |
| `name` | ISO's short form: `Korea, Republic Of`, `Russian Federation` | CLDR's English name: `South Korea`, `Russia` (50 countries differ) | Match on `alpha2` or `alpha3`, which have not changed |
| `currencies` | Included retired ones (Cuba: `["CUP","CUC"]`) | In use now (`["CUP"]`) (20 differ) | None needed |
| `countryCallingCodes` | One entry per area code (`["+7","+7 3","+7 4","+7 8"]`) | The calling code (`["+7"]`); `callingCode` is the same as a string (37 differ) | Use `callingCode` |
| `ioc` | `country-data`'s | The IOC's, from Kuni 1.3: `FRO`, `LBN`, `SGP` (were `FAI`, `LIB`, `SIN`); `FLK` filled in; `GCI` and `JCI` (Commonwealth Games codes) gone | Use the new codes |
| `languages` | Three-letter codes | Still three-letter codes, from Kuni's two-letter lists: some are shorter or ordered differently | The most used language is the same for 230 of 250 |
| New fields | none | `numeric`, `names`, `shortName`, `reading`, `aliases`, `continent`, `subregion`, `callingCode`, `tld`, `capital`, `timeZones`, `subdivisionType`, `population`, `area`, `location`, `borders`, `drivingSide`, `weekStart`, `measurement`, `paper`, `hourCycle`, `flag` and more | Additive; a client that ignores unknown fields is unaffected |

`locale=ja` names a country in Japanese; `locale=de` and the other locales still name it through the runtime's CLDR, as before. The full account is in [docs/reference-data.md](reference-data.md#what-changed-from-the-country-data-list).

**Keeping the old list.** Install `country-data` and read it yourself; this package does not serve it any more, because a list that holds `BY` twice cannot be made into a country picker. A fixture file of the old `/countries` response from a 2.x server is the simplest way to keep a test steady.

**Static API and fixtures.** `api/countries.json` holds the 250 whole (it used to hold the first hundred of 289). Paths are as they were.

## 3. Dependencies

- `@johnmorrisdotca/kuni` (`^1.3.0`) is a dependency. It holds the countries, subdivisions and groupings as data, loaded the first time a request needs them, so starting the server and every request that does not ask for a place pay nothing for it.
- `country-data` is no longer a dependency (it is a dev dependency, for the test that compares the lists).
- `@johnmorrisdotca/address-plus` is `1.6.0` or later. Nothing about `/names`, `/users` or `/companies` postcodes changed.
- `@johnmorrisdotca/hata` (flags) and `@johnmorrisdotca/chizu` (maps) are **optional peer dependencies**; neither is installed with the package.

Pin or range your own dependency on the package as `^3.0.0` (the example projects do). A project on `^2` does not move by itself.

## 4. Maps need Chizu to be installed

**2.x.** The datasets did not draw maps.

**3.0.** `/maps/{code}.svg` draws a country or a subdivision, with [Chizu](https://github.com/johnmorrisdotca/chizu) (22 MB of outlines). Chizu is an optional peer dependency, like Hata, so `npx` does not download it. Without it, `/maps/JP.svg` answers `501` and the message says `npm install @johnmorrisdotca/chizu`. The Docker image carries it. Nothing else changes when it is missing: a record's `flag` is still a CDN address, and the playground simply shows no map.

## What did not change

- Every route 2.x had, with its parameters, its filters, its paging and its status codes.
- Seeded output other than the safe values above: `?seed=7` writes the same records, with `safe=false`.
- `?locale=`, `expand`, `fields`, `sort`, `q`, `format=json|csv|yaml|xml|ndjson|sql`, `session`, `auth` and the failure drills.
- The `@johnmorrisdotca/rest-in-pieces/vite`, `/msw` and `/serialize` entry points, and `createApp` in-process.

## New in 3.x

3.0 itself adds the countries from Kuni and `/countries/withdrawn`. The datasets that follow it are additive minor releases: subdivisions and groupings (3.1), flags and maps (3.2), addresses (3.3) and the static API in CSV, NDJSON and SQL (3.4). See the [changelog](https://github.com/spxis/rest-in-pieces/blob/main/CHANGELOG.md).

## Checking an upgrade

1. Run your tests with `?safe=false` (or `--no-safe`) first. If they pass, the only difference is the safe values, and you can decide whether to keep the safe default.
2. Search your code for `/countries` and for `status`, and for the nine country fields above.
3. If you call `/maps`, install Chizu.
