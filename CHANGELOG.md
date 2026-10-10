# Changelog

Notable user-facing changes are recorded here. The project follows [Semantic Versioning](https://semver.org/).

## Unreleased

## 3.1.0 - 2026-10-10

### Added

- `GET /geo/features` and `/geo/features/{id}`: the world's 2,790 named physical features from [Chizu](https://github.com/johnmorrisdotca/chizu) (Natural Earth, public domain; names from Natural Earth and Wikidata, CC0): oceans, seas, gulfs, bays, straits, lakes, reservoirs, rivers, deserts, mountain ranges, plateaus, plains, peninsulas and the other landforms, and peaks. Each record has an `id` (its Wikidata item, else Natural Earth's `ne-…`), `wikidata`, `kind`, `group`, `name` (Japanese for `locale=ja` where there is one) and `names { en, ja }`, `reading` in kana, `rank`, a peak's `elevation`, a `location` point, a `bbox` (never a shape; `west` is greater than `east` across the 180th meridian), the `countries` whose map holds it, and a `map` path that lights it. Filter by `kind`, `group`, `countries` and `rank[lte]`; search names in English, Japanese or kana with `q`.
- `GET /countries/{code}/features`, and `expand=countries` on a feature.
- `/maps/{code}.svg` takes `features` (`water`, `all`, a group such as `peaks`, a kind such as `strait`, several at once) to draw the named features on a country's or a region's map, and `feature` to light one by its id; a feature the map does not hold is `404`, a word that is none of the choices `400`.
- Chizu is an optional peer dependency, as for `/maps`: without it (or with a Chizu older than 1.2.0) the three routes answer `501` naming `npm install @johnmorrisdotca/chizu`. It is loaded on the first request, which reads its 239 feature files once (about 0.2 s, 25 MB while it reads).
- The static API holds the dataset whole, in the default locale only, in JSON, CSV, NDJSON and SQL: `api/features.json`, `api/features/{id}.json` and `api/countries/{code}/features.json`. A Features tab in the playground lists them with a map thumbnail that lights each one; the GitHub Pages copy of the API inside a tab has no such tab, because it cannot load Chizu.
- The Postman and Bruno collections have the new requests; [docs/reference-data.md](docs/reference-data.md) has the fields, the rules for `countries` and `bbox`, and the licence line; the README lists the route; the npm keywords gain `geographic-features` and `natural-earth`.

### Changed

- The static API is about 65,000 files and 81 MB (it was 52,000 and 67 MB); the geographic features are 13.5 MB of it. `apps/web/scripts/staticApi.ts` skips a feature's own `countries` list, which `countries` on the record already holds.
- The playground's UI preview draws a feature as a card, and `mapAddress` follows a feature's `map`.

## 3.0.0 - 2026-10-09

A major release: `/countries` now comes from Kuni and safe values are on by default. Every breaking change, and how to keep the 2.x behaviour, is in [docs/upgrading-to-3.md](https://github.com/spxis/rest-in-pieces/blob/main/docs/upgrading-to-3.md).

### Countries from Kuni

This is the release that makes 3.0.0: safe values are on by default, and `/countries` is a different list. [docs/upgrading-to-3.md](docs/upgrading-to-3.md) has every breaking change, before and after, and how to keep the 2.x behaviour. The items below it are 3.1.0, 3.2.0 and so on, one minor release each.

#### Added

- `/countries` is made from [Kuni](https://github.com/johnmorrisdotca/kuni) instead of `country-data`, which is dropped (it stays a dev dependency, for the test that compares the two). Every country now also has `numeric`, `names` (`{ en, ja, native }`), `shortName`, `reading`, `aliases`, `continent`, `subregion`, `callingCode`, `tld`, `capital` (`{ en, ja }`), `timeZones`, `subdivisionType`, `population`, `populationYear`, `areaKm2`, `areaYear`, `location`, `capitalLocation`, `borders`, `drivingSide`, `weekStart`, `measurement`, `paper` and `hourCycle`, and the Japanese locale names a country in Kuni's Japanese. Kuni is loaded the first time a country is asked for, not at start-up.
- `GET /countries/withdrawn` and `/countries/withdrawn/{code}`: the 31 countries ISO 3166-3 withdrew (`SU`, `YU`, `CS`, `DD`, `ZR`, `TP`, `AN`, `BU` and the rest), each with the four-letter code, the alpha-2, alpha-3 and numeric codes it held, its name in English and Japanese, `since` and `until` (the years the code was in force), `successors` (`expand=successors` and `/countries/withdrawn/SU/successors` give the countries) and `reusedBy` where a current country holds the alpha-2 code now. They are never in `/countries`. A code is found by its four letters, alpha-2, alpha-3 or numeric code. The codes, the years and the successors are ISO 3166-3's own table, held by Kuni 1.3, which is the API's dependency (`^1.3.0`); `successors` names the countries ISO lists (so `YU` has `CS`, and `CS` has `RS` and `ME`), and `/countries/withdrawn/CS` finds `CSXX`.
- A list field matches a filter when any entry does: `borders=FR`, `successors=RS`, `currencies=EUR`, `timeZones=Asia/Tokyo`. `/countries/{id}` takes a numeric code too (`/countries/392`).
- A dataset can be made of something that loads on first use (`Resource.ready`), have routes of its own (`Resource.mount`) and list another dataset's records by a field of ids (`kind: 'list'`); `GET /resources` gives each dataset's `path`.
- [docs/reference-data.md](docs/reference-data.md) says what `/countries` and `/countries/withdrawn` hold, what changed and where each source comes from; the README has a "Real places, invented people" section and the sources' licences; the playground has tabs for the new dataset, in English and Japanese.

#### Changed

- **Safe values are on by default** (breaking). Every dataset, `/generate`, the streams, the mock of your own OpenAPI document, the offline generator, the CLI, the playground and the static API write emails at `example.com`, fiction-range phone numbers, test card numbers, documentation IP addresses and self-hosted avatars unless asked not to: `?safe=false` on one request, `--no-safe` on `serve` and `generate`, `REST_IN_PIECES_SAFE=false`, `createApp({ safe: false })` or `app: { safe: false }` in-process, in Vite, MSW and a browser tab. `safe=false` writes the 2.x values byte for byte (a test pins the hashes of 2.13.0's records). `--safe` and `REST_IN_PIECES_SAFE=true` still work and now change nothing.
- `@johnmorrisdotca/kuni` (^1.3.0) is a dependency of the package, and `country-data` is not.
- `/countries` serves the 250 current countries, not the 289 records of `country-data` (which held 29 deleted codes and 10 reserved ones, so that `AI`, `BQ`, `BY`, `CS` and `GE` appeared twice). The deleted codes are at `/countries/withdrawn` with `status: "deleted"`. The nine fields it had keep their names, order and types for every code; `name` is CLDR's English name (`South Korea`) for 50 countries, `currencies` and `countryCallingCodes` are those in use now for 20 and 37, `languages` are still three-letter codes and `ioc` is the International Olympic Committee's three-letter code from Kuni 1.3 (see [docs/reference-data.md](docs/reference-data.md#what-changed-from-the-country-data-list)).
- The static API and the fixtures hold the whole of a reference dataset (250 countries), not its first hundred records; and the Postman and Bruno collections have the new routes.
- The README's Safe values tables move to [docs/safe-values.md](docs/safe-values.md), leaving a summary and a link, to make room.

#### Fixed

- The static API no longer repeats five country codes.

### Regions: subdivisions and groupings

#### Added

- `GET /subdivisions` and `/subdivisions/{code}`: the 5,050 ISO 3166-2 subdivisions of 200 countries (states, provinces, prefectures, counties, Länder, France's departments) with `code`, `country`, `shortCode`, `type`, `level`, `parent`, `name` (Japanese for `ja`, English otherwise), `names` (`{ en, ja }`), `reading`, `capital`, `population`, `populationYear`, `areaKm2`, `areaYear`, `location` and `capitalLocation`, from Kuni (Unicode CLDR and Wikidata). Filter by `country=JP`, `type=prefecture` or `level=1`, sort by `population:numeric`, search with `q`. The first request for a country loads only that country's subdivisions and facts; a request that names none loads all 200, once.
- `GET /countries/{code}/subdivisions` (by alpha-2, alpha-3 or numeric code) and `/countries/{code}/groupings`; `/subdivisions/{code}/children`; and `expand=subdivisions`, `groupings`, `country`, `parent` and `children`.
- `expand=subdivision` on `/names` and `/companies`: the first-level subdivision a record's `province` names in its `country`, matched by English or Japanese name (`Ontario` is `CA-ON`, `東京都` is `JP-13`), or `null`. It adds nothing to a record unless asked, so the seeded output is unchanged.
- `GET /groupings` and `/groupings/{id}`: Kuni's 107 groupings (the seven continents, the UN M49 areas, 23 international bodies with the days members joined and left, 16 informal groupings with their definitions, and regions inside a country such as Japan's 地方), with `members`, `memberCount`, `periods`, `others`, `definition`, `source` and `asOf`. `members=JP` finds the groupings that hold Japan; `/groupings/{id}/countries` and `/groupings/{id}/subdivisions` list the members and `expand=countries` embeds them.
- The static API and the fixtures hold all 5,050 subdivisions and all 107 groupings, in the default locale only (every record carries both languages in `names`), each country's own list at `countries/{code}/subdivisions.json`.
- [docs/reference-data.md](docs/reference-data.md) has the fields, the province link and the sources; the README lists the new routes; the playground has Subdivisions and Groupings tabs, in English and Japanese.

#### Changed

- The README's Relations section moves to [docs/relations.md](docs/relations.md), leaving a summary and a link, to make room.

### Flags and maps

#### Added

- `flag` on every country and subdivision: the address of its flag's SVG on the jsDelivr CDN from [Hata](https://github.com/johnmorrisdotca/hata) (`https://cdn.jsdelivr.net/npm/@johnmorrisdotca/hata@1/dist/svg/jp.svg`), or `null` where Hata has none (245 countries and 219 subdivisions have one). The package holds a 2 KB list of the codes Hata has and no flag; `scripts/hata-codes.ts` makes it and a test fails when it is not the installed Hata's own.
- `GET /flags/{code}.svg`, answered like `/avatars`: a standalone SVG, cached for a day, by alpha-2 or ISO 3166-2 code in any case. `shape` (`own`, `4:3`, `1:1`, `round`), `fit` (`auto`, `whole`, `crop`, `cover`, `hoist`, `contain`) and `variant` are Hata's, so a square or round flag never stretches. The server fetches nothing while a request waits: with `@johnmorrisdotca/hata` installed beside this package (an optional peer dependency) the flag is drawn from it; without it a plain request is a `302` to the CDN and a framed one is `501`, saying to install it. `REST_IN_PIECES_FLAGS=cdn` and `createApp({ flags: 'cdn' })` always redirect. `404` for a code with no flag, `400` for an unknown shape or fit.
- `GET /maps/{code}.svg`, drawn by [Chizu](https://github.com/johnmorrisdotca/chizu) (an optional peer dependency, like Hata, loaded the first time a map is asked for; without it `/maps` is `501` and names the package to install): a country's outline by alpha-2, alpha-3 or numeric code (238 countries), or a subdivision lit on its country (`JP-13`, `CA-ON`, `DE-BY`: the regions of 32 countries). `color` fills it, `capital=true` and `dot` put a dot on a country's capital, `lang` sets the label. `404` for a map Chizu does not have, `400` for a colour that is not hex. The API inside a browser tab has no maps (`501`).
- The playground's cards for countries and subdivisions show the flag, and a map beside it where the API can draw one; the tabs' descriptions say so, in English and Japanese.
- [docs/reference-data.md](docs/reference-data.md) has the parameters, where the SVG comes from and the licences; `/flags` and `/maps` are in the OpenAPI document, the Postman and Bruno collections and the README.

#### Changed

- Nothing a client relied on: the nine original country fields are as they were, and `flag` is new.

### Addresses in seven countries

#### Added

- `GET /addresses` and `/addresses/{id}`: 1,000 addresses for each `seed` in the United States, Canada, Japan, Australia, the United Kingdom, France and Germany, each in its country's own postal format (`lines` as USPS, Canada Post, Japan Post, Australia Post, Royal Mail, La Poste and Deutsche Post write them) with a postcode that exists in the right region: a US state's ZIP prefixes, a Canadian province's postal letters, an Australian state's postcode blocks, a Royal Mail district, one of La Poste's 6,328 and one of GeoNames' 10,813 for its department or Land, and a Japan Post code delivered to its prefecture. `country=JP` narrows it; `regionCode` is an ISO 3166-2 code and `expand=subdivision` embeds the record in `/subdivisions`. Street names are invented (Japanese town names come from a short list of common ones), so no address is a real person's. A test runs all 1,000 default addresses through address-plus's validator and fails on a postcode that disagrees with its region.
- `GET /addresses/validate?address=…&country=…` (what disagrees in an address you give, such as `Postcode 2000 belongs to NSW, not VIC`) and `GET /addresses/format?address=…&country=…` (the address as its country's post writes it): address-plus's checker and formatters, bounded to 300 characters, with nothing looked up on the network and nothing kept.
- The country modules of address-plus (`/au`, `/fr`, `/de`, `/gb`, `/jp`) are imported, and the French and German postcodes indexed (about 60 ms), the first time a request asks for addresses; the first request for a new seed builds its 1,000 addresses in about 100 ms.
- The playground has an Addresses tab, with the address as an envelope shows it, in English and Japanese; [docs/reference-data.md](docs/reference-data.md) has the fields, what "right region" means for each country and the licences of the tables.

#### Changed

- `@johnmorrisdotca/address-plus` is 1.6.0 (was ^1.1.0). The postcodes `/names`, `/users` and `/companies` lay over a Canadian or American region are as they were.

### Static API in CSV, NDJSON and SQL

#### Added

- Every `.json` of the GitHub Pages static API has the same records as a `.csv`, a `.ndjson` and a `.sql` beside it: `api/users.csv`, `api/users/page/2.csv`, `api/users/1.csv`, `api/users/1/orders.sql`, `api/ja/products.csv`, `api/jsonplaceholder/posts.ndjson`. They are made by the API's own serializers (`?format=csv`, `ndjson`, `sql`), so they are what the live API answers byte for byte: CSV with the UTF-8 byte order mark, so Excel reads Japanese; NDJSON one record a line; SQL an `INSERT` for each record into a table named for the dataset (`orders` for `users/1/orders.sql`). No YAML or XML. `api/index.json` lists them (`formats`, and `{format}` in each path template).
- Spreadsheets and databases read a file as it is: Google Sheets `=IMPORTDATA("…/api/users.csv")`, Excel's From Web, `pandas.read_csv(url)`, R `read.csv(url)`, `curl …/users.sql | sqlite3 test.db`, `curl …/users.ndjson | jq`. Pages serves a `.csv` as `text/csv` and a `.ndjson` and `.sql` as downloads, which those tools read as they are. [docs/static-api.md](docs/static-api.md) and the README's zero-install section have the recipes.
- `toCsv`, `csvCell` and `CSV_BOM` join `toNdjson` and `toSql` in `@johnmorrisdotca/rest-in-pieces/serialize`, the pure functions the API, the playground and the static files all use.
- `apps/web/scripts/staticApi.test.ts` checks that every `.json` has its three siblings and every sibling its `.json`, that the NDJSON, CSV and SQL of a page, a record and a list hold the JSON's records, that the CSV is the API's bytes, and that the CSV of a Japanese page parses back to the JSON's records.

#### Changed

- The static API is larger: 6.0 MB in 6,367 files before 2.25 (JSON only, first 100 records of each seeded dataset) and 71 MB in 51,983 files now: 20 MB of JSON (of which the real reference data, whole, is 13 MB) and 51 MB of CSV, NDJSON and SQL. The countries and withdrawn countries are written for the default locale only (their `names` hold both languages), which keeps a Japanese copy of 250 countries and their lists (33 MB) out. Written in under a minute.

### The eleventh use case

#### Added

- An eleventh use case on the use cases page and in [docs/use-cases.md](docs/use-cases.md): "Country, region and flag pickers": a country select that fills a region select and the place they name, drawn from three real requests (the G7 as countries, Canada's provinces, Ontario), with the `fetch` and `curl` that make it, in English and Japanese. The README, the page's jump list and its tests say eleven. The page needs no change to the API.
- [docs/avatars-and-placeholders.md](docs/avatars-and-placeholders.md): the README's Images section moves there, leaving a summary, to make room.

## 2.24.1 - 2026-10-09

### Fixed

- The test of `delay` and `trickle` together moves its fake clock only to the timers the response sets, never by a fixed step, which could carry it past the finish on a slow machine. That stopped the release run of 2.24.0 before publishing, so this release is the first on npm with the starters and the Postman and Bruno collections listed for 2.24.0.

## 2.24.0 - 2026-10-09

### Added

- `examples/` with three starters that load seeded data and show loading and error states: React with Vite, Vue with Vite (both add `restInPieces()` to `vite.config.js`) and Next.js (one route handler answers `/api/*` with `createApp()`). Each has an "Open in StackBlitz" link, with no account, and the Vite two a CodeSandbox link. The starters install the package from npm and are not part of the workspace.
- A Postman collection (v2.1) and a Bruno collection with a request for every route, made from the OpenAPI document by `pnpm collections`: `limit` and `seed` on and every other parameter listed, off, with its description; a seeded example body for each write; a `baseUrl` variable and, for the one route that needs it, a `token`. The GitHub Pages build serves the Postman file at `/collections/rest-in-pieces.postman_collection.json`, so Postman imports it by link with no account (Postman's "Run in Postman" button needs a published workspace, which needs an account). The OpenAPI document can be imported by link too.
- `collections-files.test.ts` fails when the committed collections are not what the generator makes now, and checks that every operation is in both once, every request starts at `{{baseUrl}}`, every path variable is defined and every body is JSON.
- [docs/starters-and-collections.md](docs/starters-and-collections.md) has the links and the steps.

## 2.23.0 - 2026-10-09

### Added

- `GET /streams/{messages|notifications|metrics|logs}` plays a dataset as Server-Sent Events, one record per event: `id` is the record's `id`, `data` the record as JSON, and the first N events are the first N records of the dataset for the same seed and locale, so a stream replays exactly. Events are unnamed, so `EventSource.onmessage` receives them, and the stream ends with an `end` event. `GET /streams` lists the streams.
- `count` (1 to 500 events, default 20), `every` (100 to 10,000 ms, default 1,000), `duration` (1 to 60 seconds one connection stays open), `seed`, `locale`, `safe`, `delay`, `status` and `fail`. `Last-Event-ID` (or `lastEventId`) resumes after the last id seen; once every event has gone a reconnect is answered `204`, which stops `EventSource`. `drop=3` closes the connection after three events with no `end`, to rehearse a client that reconnects.
- Bounded, because an open stream is a held connection: 500 events, 60 seconds a connection, an event at most every 100 ms, one timer per open stream and nothing running between events; a client that goes away stops it. `createApp({ streams: false })`, or `REST_IN_PIECES_STREAMS=off` for the Node app, turns it off for hosts that bill by connection time (it answers `404`).
- Works through `npx`, Docker, the Vite plugin, in-process (`app.request()`), Mock Service Worker handlers (with `fetch`) and the API inside a page (with `fetch`; `EventSource` cannot reach it). WebSocket is not offered. [docs/streams.md](docs/streams.md) says what works where.
- The OpenAPI document describes the routes under "Streams". Playground: a Streams tab that listens with `fetch`, shows the events as they arrive, stops, and resumes a stream that was cut, with the `EventSource` and `curl` to copy, in English and Japanese.

## 2.22.0 - 2026-10-09

### Added

- `rest-in-pieces serve --openapi ./openapi.yaml` (also `--openapi` on the main command) answers every operation of an OpenAPI 3.x or Swagger 2.0 document, JSON or YAML, with seeded data in the shape of its response schema. The answer is the operation's lowest `2xx` response, made by the generator behind `POST /generate`, seeded from the seed, the method and the address: the same request gives the same body, `/pets/1` and `/pets/2` differ, and a path parameter lands in the matching property. A list is as long as the `limit`, `pageSize`, `per_page`, … the operation declares (ten when none, at most 100); the fields a write sends are put into its answer; the headers the document lists are made.
- Requests are checked against the document: path, query and header parameters, and a JSON body (types, `required`, `enum`, bounds, lengths, `format`, `items`, `allOf`, `anyOf`, `oneOf`). A fault is a `400`, or a `422` when the document lists `422` and not `400`, naming every fault and where it is. A body over 64 KB is `413`, a body that is not JSON `400`, another content type `415`; an unknown address is `404` and a method it does not have `405` with `Allow`.
- `?delay=`, `?status=`, `?fail=` and `?trickle=` work on every route. `?status=404` answers with the body the document gives that status; `?seed=`, `?locale=` and `?safe=` work too. An operation that declares one of those names itself keeps it, and the control is `?_status=503` there (`?_name` works everywhere).
- `GET /__mock` lists the operations, `/__mock/openapi.json` serves the document and `/__mock/docs` shows it. The start-up message lists what is mocked.
- `createMockApp(document)` and `createMock(document)` from `@johnmorrisdotca/rest-in-pieces/mock`: the same mock in process, with no Node modules, for tests, workers and Mock Service Worker handlers. `OpenApiError` names every fault in a document it cannot mock.
- A `$ref` must point inside the document (a URL or file is refused, anywhere in it, and nothing is fetched); a keyword the generator cannot honour, a pattern it cannot read and a schema that can never be made (a loop through required properties) stop start-up and are listed together. Bounded: 1,000 operations, 500,000 values and 5 MB in a document; a response of at most 5,000 values, 1,000,000 characters and 100 list items; JSON bodies only (a response that lists only another type answers `501`); `pattern`, security schemes and `example` values are not used; writes are answered, not kept.
- [docs/mock-your-openapi.md](docs/mock-your-openapi.md) has the rules and the limits; the playground's JSON Schema note points to it, in English and Japanese; `pack:test` runs the installed `serve --openapi`.

### Changed

- The README's Custom fields section moves to [docs/custom-fields.md](docs/custom-fields.md), leaving a short section and a link, to make room; its Prism row now says what each does with an OpenAPI file.

## 2.21.0 - 2026-10-09

### Added

- A read-only copy of the API as plain files on the GitHub Pages site, at `https://spxis.github.io/rest-in-pieces/api/`: nothing to install, no key and no server, with CORS open. `users.json` is the first page of ten, `users/page/2.json` the next, `users/1.json` one record, `users/1/orders.json` the records it owns, `ja/products.json` the same in Japanese, and `index.json` lists what is there. A page number is in the path and every address ends in `.json`, because Pages cannot read a query string and chooses the content type from the ending.
- Every dataset holds its first 100 records at seed 1, in the default locale and in Japanese; `metadata.links` point at the files that answer them, and the cursors are `null`. `jsonplaceholder/` holds JSONPlaceholder's shapes and lengths as bare arrays (100 posts, 500 comments, 200 todos, 10 users, and `posts/1/comments.json`, `users/1/posts.json`), so a JSONPlaceholder tutorial works by changing the base address and adding `.json`.
- The playground's top bar links to it ("Static API", in English and Japanese). [docs/static-api.md](docs/static-api.md) has every path and limit, and the README has a "zero install" section with a `fetch` example.
- Written by the Pages build from the same API in about a second: about 6,400 files and 6 MB. `apps/web/scripts/staticApi.test.ts` checks that every link leads to a file, that a record equals the API's answer and that files stay small; a Pages end-to-end test fetches it.

### Changed

- The playground's top bar leaves a little less room between its links on a phone, so the new link fits beside the language picker.
- The README's Fixtures section moves to [docs/fixtures.md](docs/fixtures.md), leaving a short section and a link, to make room; its size is corrected to about 1,950 files and 157 MB (it said 1,120 and 76 MB).

## 2.20.0 - 2026-10-09

### Added

- A use cases page in the playground, at `use-cases/` on GitHub Pages and `?view=use-cases` everywhere else, linked from the top bar and the README, in English and 日本語, light and dark, and laid out for a 390 px phone. Ten use cases, each with the problem in a line, the request or code that solves it (one press copies it) and a short animation: a front end built before its backend (a table fills with people, then an order with its buyer and products), a JSONPlaceholder tutorial that takes a `POST`, loading, flaky, down and empty states (`delay`, `trickle`, `fail=0.3`, `status=503`), data that breaks layouts (`messy`), sign-in with a token that expires and is refreshed, the same seed twice, seeding a database (`format=sql` and `ndjson`), mock records from a JSON Schema, one seed in four locales, and invented FHIR patients, invoices and transactions. The animations are not recordings: each sends the requests shown beside it to the API (inside the page on GitHub Pages) and draws what comes back, plays once when it scrolls into view, can be replayed, never loops, and shows its finished state at once for a reader who asks for reduced motion.
- `docs/use-cases.md`: the same ten in prose with the requests.
- `docs/images/use-cases.svg`, the animation at the top of the README, written by `pnpm readme:animation` from the API's own answers (the people at a fixed seed, ten answers to `fail=0.3` with a fixed random sequence, a `503` with its `Retry-After`). It is one small CSS-animated SVG that plays inside an `<img>` on GitHub and npm, rests on the finished picture, and shows it straight away with animation off. A test holds the committed file to what the API draws today.

## 2.19.2 - 2026-10-09

### Fixed

- The test suite allows 20 seconds a test, not vitest's 5: the release runner, with coverage on, took longer than 5 over the few tests that build every locale or a request at its size limit, which stopped the release runs of 2.14.0, 2.15.0 and 2.19.1 before publishing. This release is the first on npm since 2.13.0 and carries everything listed for 2.14.0 to 2.19.1.

## 2.19.1 - 2026-10-09

### Fixed

- The release check's slowest test (every record of every locale accepted back as a `PUT` body) has the time it needs. It ran past vitest's 5-second default on GitHub's runner, so the release runs of 2.14.0 and 2.15.0 stopped before publishing, and 2.16.0 to 2.19.0 were never tagged on GitHub. Its own release run then stopped on another slow test, which 2.19.2 fixes for the whole suite.

## 2.19.0 - 2026-10-09

### Added

- `/patients`, `/observations`, `/conditions` and `/encounters`: invented resources in the shape of FHIR R4's Patient, Observation, Condition and Encounter, seeded and localized, read-only, with every dataset feature (paging, sorting, filters, formats, `messy`, the simulation). Each resource carries a `synthetic` tag. **Synthetic, not de-identified: nothing was derived from a real person or record, no statistical resemblance is claimed, and the clinical codes are this project's own short lists in `urn:rest-in-pieces:synthetic:…` code systems, not SNOMED CT, LOINC, ICD or CPT** (HL7's own free code systems and UCUM units are used where FHIR defines them).
- The records agree with their patient: a patient's birth date and gender are a function of the seed and the id, the same in every locale; observations are dated after birth and before death with values plausible for the patient's age and an interpretation that matches the reference range beside them; conditions begin after birth and when the patient was old enough, and end after they begin; encounters end after they start, planned ones start after 2026-01-01, and a patient who died has only finished encounters. Contact details are always fiction-range phone numbers and `example.com` emails.
- `GET /fhir/{Patient|Observation|Condition|Encounter}` answers a searchset Bundle as `application/fhir+json` (`_count` up to 100, `_offset`, a few search parameters per type including `patient`, `code`, `status`, `date` with `ge`/`le` prefixes), `GET /fhir/{type}/{id}` the resource, and `GET /fhir/metadata` a CapabilityStatement; errors are `OperationOutcome`s. A search parameter it does not support is a `400` that names it, never ignored. Read-only and JSON only.
- The OpenAPI document describes them under "Synthetic patients (FHIR R4)". Playground: a tab, icon and UI-preview card for each. [docs/synthetic-patients.md](docs/synthetic-patients.md) has the rules and the whole disclaimer.

### Changed

- The live demo's static fixtures write the four FHIR datasets, `/metrics` and `/logs` for the default locale only, since they are large or the same in every locale; every locale still answers them from the API.

## 2.18.0 - 2026-10-09

### Added

- `rest-in-pieces generate --schema people.json --count 100000 --format sql` writes seeded records from a JSON Schema, an OpenAPI document (JSON or YAML, with `--component`) or a field list (`--fields`, `--constraints`) to a file (`--output`) or standard output as `ndjson`, `json`, `csv` or `sql`, with no server. Records are made and written one at a time in 64 KB pieces, waiting when a pipe or disk is slow, so memory stays flat: 100,000 small records take about 1.5 seconds. `--count` goes to 10,000,000. The records are the API's for the same schema, `--seed`, `--locale` and `--safe`, and the first N of a larger run are the N of a smaller one. SQL uses the API's quoting (`--table`, `--batch` rows per `INSERT`, `--transaction`); CSV can start with a byte-order mark (`--bom`) and fixes its columns from the schema before the first row. A schema, field list or locale it cannot use prints `error: …` and exits 1, and a file that failed half way is removed. `--help` lists everything.
- `streamRecords` and `streamFromSchema` make the same records one at a time, and `iterate` is `build` made lazily; `GET /generators`, `/generate` and the playground are unchanged. [docs/offline-generator.md](docs/offline-generator.md) is the reference.
- `pnpm pack:test` runs the installed `generate`.

## 2.17.0 - 2026-10-09

### Added

- `POST /generate` takes `{ "schema": {…} }` (a JSON Schema) or `{ "openapi": {…}, "component": "Pet" }` (an OpenAPI 3.x or Swagger 2 document) instead of `fields`, and returns seeded records that match: `type` (one or a list), `enum`, `const`, `nullable`, `properties`, `required`, `items`, `prefixItems`, `minItems`, `maxItems`, `uniqueItems`, `minLength`, `maxLength`, `pattern`, `format`, `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`, `multipleOf`, `allOf`, `oneOf`, `anyOf`, `writeOnly`, and local `$ref`s. Properties called `email`, `name`, `city` and the like get matching values, and `x-generator` names any generator type. The same seed, locale and schema give the same records; paging, sorting, filters, formats, `locale`, `safe`, `messy` and the simulation work as on every list.
- `pattern` is made by a hand-written parser (`[A-Z]{3}-\d{4}`, groups, alternation, repeats) and never run as a regular expression, so no pattern can hang the server; lookahead, backreferences and the like answer `400`.
- Bounded: 2,000 schema parts, 8 levels of nesting, 20 items per array, 256 characters per string, 500 values per record, 200,000 values and 4,000,000 characters per request. A `$ref` must point inside the document: a URL, file or relative path is a `400` and nothing is fetched. A reference loop is cut where a property is optional and a list may be empty, and refused (`400`, naming the path) where it cannot end. A keyword the generator does not honour (`not`, `if`, `patternProperties` and others) is a `400` naming it, never ignored.
- Playground: a "JSON Schema" mode in the Generate tab that sends the typed schema or OpenAPI document as a `POST`, with the schema to use, in English and Japanese. [docs/schema-generation.md](docs/schema-generation.md) is the reference.

## 2.16.0 - 2026-10-09

### Added

- Nine read-only datasets: `/invoices` (line items that add up, tax in the locale's currency, due and paid dates in order), `/transactions` (money out negative, money in positive, posted after they happened), `/events` (calendar events that end after they start, IANA time zones, recurrence rules), `/messages` (replies after the message they answer, with `Re:` and the chain's subject), `/notifications` (addressed to `/users`), `/jobs` (salary ranges that rise with seniority, closing dates in order), `/places` (within 15 km of the locale's best-known city, with a GeoJSON `geometry` and `distanceKm`), and the time series `/metrics` (a point every five minutes, a daily wave, incidents) and `/logs` (a line about every fifteen seconds). Each takes the seed, locale, paging, sorting, filters, search, formats, `messy`, `safe` and the simulation; `/metrics` and `/logs` are a pure function of the seed and the index, the same in every locale. Status fields are `invoiceStatus`, `transactionStatus`, `eventStatus` and `jobStatus`, because `status` is the request parameter that simulates an error. [docs/domains.md](docs/domains.md) is the reference.
- `safe=true` moves the emails in invoices, messages and events to example domains.
- Playground: a tab, icon and UI-preview card for each, in English and Japanese.
- The live demo's fixtures cover the new datasets.

## 2.15.0 - 2026-10-09

### Added

- `/generate` derived fields: `age:=age(born)`, `end:=addDays(start, days)`, `email:=concat(lower(first), '.', lower(last), '@example.com')`. A field written `=` and an expression over the record's other fields is worked out last, in dependency order, in a hand-written expression language with numbers, text, dates, comparisons, `&& || !`, `a ? b : c` and 35 functions (`GET /generators` lists them under `functions`). No `eval`, no property access, no loops, no assignment: at most 400 characters, 150 tokens, 12 deep and 100 parts per expression and 10 derived fields per schema, with a `400` that names the field for anything unreadable, unknown, circular or over a limit. A step that cannot be worked out (a division by zero, a missing source value) gives `null`. Adding a derived field leaves every other field's values as they were.
- `constraints=end>start,total>=subtotal` (also `end after start`, `start<end`) on `GET` and `"constraints": ["end > start"]` on `POST /generate` put two fields in order by swapping them, and move the later one on when a strict constraint finds them equal. At most 10; a field the schema lacks, a derived field, a field against itself and contradicting constraints answer `400`.
- Distributions: `number.normal(mean,sd,min?,max?,dec?)`, `number.lognormal(median,sigma,min?,max?,dec?)`, `number.exponential(mean,max?,dec?)` and `number.zipf(n,s?)` (n up to 10,000), drawn from the seed with `422` errors that name the field. They are textbook shapes, not a model of any real population.
- `GET /generators` adds `functions` (the expression functions) and `limits`. The OpenAPI document describes `constraints` and the new `400` answers.
- Playground: a "= derived from other fields" type with an expression box, a Constraints box, and the distributions in the type list, in English and Japanese. [docs/coherent-records.md](docs/coherent-records.md) is the reference.

### Fixed

- `/generate`'s `date.past`, `date.future`, `date.recent`, `date.soon` and `date.birthdate` measured from the current millisecond, so the same seed gave different dates on every request. They now measure from the start of today (UTC), so a seed gives the same dates all day. Other datasets are unchanged.

### Changed

- The README moves its long reference to `docs/`: Use with (Vite, MSW, Storybook, Next.js, Playwright, Cypress, typed clients), and Writes, Sessions and Sign-in. It keeps a short section and a link for each, so existing anchors still work.

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
