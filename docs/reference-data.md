# Real places, invented people

[Back to the README.](https://github.com/spxis/rest-in-pieces#readme)

The people, companies, orders and messages REST in Pieces makes are invented, and none of them is a real person. The places they live in are real: a record from `en-CA` lives in Ontario, in Canada, and the country, the province, its capital, its flag and its postcode are the ones on the map. Real reference data about places is public fact, not personal data, so it is served as it is: the same way a test-data tool serves a real list of currencies. Nothing about a real person is in here, and nothing is ever added.

The reference data comes from the family of packages this project is part of: [Kuni](https://github.com/johnmorrisdotca/kuni) for countries and the regions inside them, [Hata](https://github.com/johnmorrisdotca/hata) for flags, [Chizu](https://github.com/johnmorrisdotca/chizu) for maps and named seas, lakes, rivers and peaks, [address-plus](https://github.com/johnmorrisdotca/address-plus) for addresses. Each is loaded the first time a request needs it, so starting the server, and every request that does not ask for a place, pays nothing for them. None of them is called while the server waits: nothing here runs on a timer, and every request is bounded.

Reference datasets have no `seed` (they are real, so a seed would change nothing), are read-only, and take every list parameter the other datasets do: paging, `sortBy`, field filters, `q`, `format` (JSON, CSV, YAML, XML, NDJSON, SQL), `expand` and `locale`.

## Countries: `/countries`

Every country and territory: the 249 ISO 3166-1 codes and Kosovo (`XK`, a user-assigned code in common use), 250 in all.

```sh
curl 'http://localhost:6800/countries/JP'
curl 'http://localhost:6800/countries/JPN?locale=ja'          # alpha-2, alpha-3 or numeric (392) code
curl 'http://localhost:6800/countries?continent=AS&sortBy=population:numeric&sortDirection=desc&limit=5&metadata=true'
curl 'http://localhost:6800/countries?borders=FR&limit=20'   # a list field matches when any entry does
curl 'http://localhost:6800/countries?format=csv'
```

| Field | What it holds |
| ----- | ------------- |
| `alpha2`, `alpha3`, `numeric` | The ISO 3166-1 codes: `JP`, `JPN`, `392`. Kosovo has no alpha-3 code, so `alpha3` is empty. |
| `name` | The name in the request's `locale`: Kuni's English or Japanese (`日本`), and for the other languages the runtime's CLDR data, as before. |
| `names` | `{ en, ja, native }`: the English and Japanese names whatever the locale, and the country's own (`대한민국`), or `null`. |
| `shortName`, `reading`, `aliases` | CLDR's short form (`US`), the Japanese name in hiragana where it is written with kanji (`にほん`), and other names people type (Holland, UK, 米国). |
| `status`, `ioc`, `emoji`, `currencies`, `languages`, `countryCallingCodes` | The fields `/countries` always had, with the same names and types. See "What changed" below. |
| `continent`, `subregion` | AF, AN, AS, EU, NA, OC or SA, and the UN M49 subregion, from UN M49 (Russia is in Europe, Cyprus in Asia). |
| `callingCode`, `tld`, `timeZones` | `+81`, `jp`, `["Asia/Tokyo"]`. |
| `capital` | `{ en, ja }`: Tokyo and 東京. |
| `population`, `populationYear`, `areaKm2`, `areaYear` | Wikidata's best-ranked figures with the year each is for. |
| `location`, `capitalLocation` | `{ lat, lon }` for the country and its capital. |
| `borders` | The alpha-2 codes of the countries it shares a land border with (`[]` for an island). |
| `drivingSide`, `weekStart`, `measurement`, `paper`, `hourCycle` | `left`, the first day of the week, the measurement system, the paper size and the clock (CLDR). |
| `subdivisionType` | What most of its first-level subdivisions are: `prefecture`, `state`, `province`. |
| `flag` | The address of its flag's SVG on the jsDelivr CDN, or `null` where Hata has none. See [Flags and maps](#flags-and-maps). |

A country's lists are `/countries/{code}/subdivisions` and `/countries/{code}/groupings`.

### What changed from the country-data list

`/countries` used to be made from the npm package `country-data`. It is made from Kuni now, which has everything that package had, and more. The nine old fields keep their names, order and types for every code, and a test compares them with the old list for all 250 (`apps/api/test/countries.test.ts`; `country-data` stays a dev dependency for it). The values that differ:

- **`name`** is CLDR's English name (`South Korea`, `Russia`, `Congo - Kinshasa`), not ISO's short form (`Korea, Republic Of`, `Russian Federation`). 50 countries differ.
- **`currencies`** are the ones in use now, from CLDR (Cuba is `["CUP"]`, not `["CUP","CUC"]`). 20 differ.
- **`countryCallingCodes`** hold the country calling code (`["+1"]`), not each area code the old list also gave (`["+7","+7 3","+7 4","+7 8"]`). 37 differ; `callingCode` is the same code as a string.
- **`languages`** are still three-letter codes (`eng`, `jpn`), mapped from Kuni's two-letter ones, and the most used language is the same for 230 of the 250. The lists themselves are Kuni's, so some are shorter or ordered differently.
- **`ioc`** is the International Olympic Committee's three-letter code, from Kuni 1.3 (Wikidata's, checked against the IOC's list), newer than the old list on three (`FRO`, `LBN` and `SGP`, which the old list had as `FAI`, `LIB` and `SIN`) and filled for the Falkland Islands (`FLK`); Guernsey and Jersey have none (the old list's `GCI` and `JCI` are the Commonwealth Games Federation's codes).
- **`emoji`** is empty for Kosovo, as before.
- **The list itself** is the 250 current countries. The old list also held the 29 codes ISO had deleted and 10 reserved codes (`status` `deleted` and `reserved`), so that five codes (`AI`, `BQ`, `BY`, `CS`, `GE`) appeared twice. The deleted codes are at `/countries/withdrawn`, with `status: "deleted"`. The reserved ones (`EU`, `UK`, `AC`, `CP`, `DG`, `EA`, `IC`, `TA`) are exceptional reservations, not countries, and are not served; `FX` and `SU` were reserved there and are withdrawn countries here.

Names and facts are in English and Japanese; `locale=de` names a country in German through the runtime's CLDR, as it did.

A country's lists are `/countries/{code}/subdivisions` and `/countries/{code}/groupings`.

## Subdivisions: `/subdivisions`

The 5,050 ISO 3166-2 subdivisions of 200 countries: Japan's 47 prefectures, the American states, Canada's provinces and territories, France's regions and departments, Germany's Länder, and the rest. The first request for a country loads that country's data (Japan's is under 3 KB); a request that names none loads all 200, once.

```sh
curl 'http://localhost:6800/subdivisions?country=JP&limit=50'
curl 'http://localhost:6800/subdivisions/JP-13?locale=ja'          # 東京都
curl 'http://localhost:6800/subdivisions?country=FR&level=2&limit=100'   # France's departments
curl 'http://localhost:6800/countries/CA/subdivisions?metadata=true'     # a country's own list, by alpha-2, alpha-3 or numeric code
curl 'http://localhost:6800/subdivisions?type=state&sortBy=population:numeric&sortDirection=desc&limit=5'
curl 'http://localhost:6800/subdivisions/FR-69?expand=country,parent'
```

| Field | What it holds |
| ----- | ------------- |
| `code`, `country`, `shortCode` | `JP-13`, `JP`, `13`. `/subdivisions/{code}` takes the code in either case. |
| `type`, `level` | `prefecture`, `state`, `province`, `county`, `region`, `department`…; `1` for a first division and `2` for one inside another (France's departments, inside its regions). |
| `parent` | The code of the subdivision it is inside, for level 2: `FR-ARA` for `FR-69`. |
| `name`, `names` | The name in the locale (Japanese for `ja`, English otherwise) and `{ en, ja }`; `ja` is `null` where no source has one, never an English name copied in. |
| `reading` | The name in hiragana, for Japan's prefectures (`とうきょうと`). |
| `capital`, `population`, `populationYear`, `areaKm2`, `areaYear`, `location`, `capitalLocation` | Wikidata's figures with their years, where it has them: complete for Japan's 47 prefectures, patchy elsewhere, `null` where it has none. |
| `flag` | The address of its flag's SVG on the CDN: 219 subdivisions have one (Japan's prefectures but Hiroshima and Kagawa, Canada's provinces, the American states, and more). |

`expand=country`, `parent` and `children` embed the related records, and `/subdivisions/{code}/children` lists them.

### A record's province links to its subdivision

People, companies and the like have a `province` and a `country` (a state, a prefecture, a region). `expand=subdivision` on `/names` or `/companies` embeds the first-level subdivision they name, found by its English or Japanese name in that country: a Canadian person in `Ontario` is in `CA-ON`, a Japanese one in `東京都` is in `JP-13`.

```sh
curl 'http://localhost:6800/names?limit=3&expand=subdivision'
curl 'http://localhost:6800/names?locale=ja&limit=3&expand=subdivision.country'
```

It adds nothing to the record unless asked, so the seeded output does not change. A province that is not one of the country's subdivisions by name (Faker draws German, French and some other regions that are not ISO's) gives `null`; the Canadian, American and Japanese locales match every record.

## Groupings: `/groupings`

107 groupings of countries, and of the subdivisions inside one country: the seven continents, the 30 UN M49 areas, 23 international bodies (the UN, the EU, the euro area, Schengen, NATO, the G7 and G20, ASEAN, the African Union and more) with the days members joined and left, 16 informal groupings (the Middle East, the Balkans, Scandinavia, the Sahel), each with the definition it follows, and regions inside a country (Japan's eight 地方, the US Census regions, Canada's five regions).

```sh
curl 'http://localhost:6800/groupings/eu'
curl 'http://localhost:6800/groupings?kind=membership&members=JP&metadata=true'   # the bodies Japan belongs to
curl 'http://localhost:6800/groupings/g7/countries?metadata=true'                 # the seven, as countries
curl 'http://localhost:6800/countries/NO/groupings?kind=membership&metadata=true'
curl 'http://localhost:6800/groupings/jp-kanto?expand=subdivisions'
```

| Field | What it holds |
| ----- | ------------- |
| `id`, `kind` | `eu`; `continent`, `m49`, `membership`, `informal` or `subdivision`. |
| `name`, `names`, `shortName`, `reading` | In the locale (Japanese for `ja`), in both languages, the short form (`EU`, `国連`) and the Japanese reading. |
| `informal`, `definition`, `note` | An informal grouping says what its members follow, and where definitions disagree, why. |
| `members`, `memberCount` | The alpha-2 codes (ISO 3166-2 codes for a grouping inside a country), in order. `members=JP` finds the groupings that hold Japan. |
| `periods`, `others` | For a body: every period of membership with its `since` and `until`, and the countries that stand with it without being members (candidates, observers). |
| `country`, `parent` | For a grouping inside a country, the country; for a UN M49 area, the area that holds it. |
| `source`, `asOf` | Where the list comes from, with its terms, and the day it was true. |

`/groupings/{id}/countries` and `/groupings/{id}/subdivisions` list the members, and `expand=countries` embeds them.

## Flags and maps

A country's or a subdivision's `flag` is the address of its SVG on the jsDelivr CDN (`https://cdn.jsdelivr.net/npm/@johnmorrisdotca/hata@1/dist/svg/jp.svg`), so no flag is in this package, and the major version is pinned, so a break in Hata does not reach you. 245 countries and 219 subdivisions have one; the rest are `null`, never a near miss. The flags are Wikimedia Commons' files and flag-icons' drawings, kept by Hata with the author and licence of each; [Hata's manifest](https://github.com/johnmorrisdotca/hata) has them.

`GET /flags/{code}.svg` answers like `/avatars`: a standalone SVG, cached for a day. The code is an alpha-2 (`JP`) or an ISO 3166-2 code (`jp-13`, `CA-ON`, `de-by`) in any case.

```sh
curl -L 'http://localhost:6800/flags/jp-13.svg'
curl 'http://localhost:6800/flags/ca.svg?shape=1:1&fit=whole'     # a square that shows all of the flag
curl 'http://localhost:6800/flags/us.svg?shape=round'
curl 'http://localhost:6800/flags/de.svg?variant=stripes'
```

| Parameter | What it does |
| --------- | ------------ |
| `shape` | `own` (the default: its own proportions), `4:3`, `1:1` or `round`. |
| `fit` | `auto`, `whole`, `crop` (at the side chosen for the flag), `cover`, `hoist` or `contain`. |
| `variant` | Which of a place's flags in real use to draw, by its id from Hata (`de-facto`, `stripes`, `local`). |

**Where the SVG comes from, and what the server fetches.** The server never fetches a flag while a request waits. If `@johnmorrisdotca/hata` is installed beside this package (`npm install @johnmorrisdotca/hata`; it is an optional peer dependency, 27 MB of flags, so `npx` does not install it), the flag is read from it and drawn here, with every parameter above. If it is not, a plain request is answered `302` with the CDN address, which a browser or `curl -L` follows, and a request for a `shape`, `fit` or `variant` is `501`, which says to install it. `REST_IN_PIECES_FLAGS=cdn` (or `createApp({ flags: 'cdn' })`) always redirects, even where Hata is installed. A code with no flag is `404`; a `shape` or `fit` that is not one of the above is `400`.

`GET /maps/{code}.svg` draws a map with Chizu, in the family's colours, as one standalone SVG:

```sh
curl 'http://localhost:6800/maps/JP.svg'                           # Japan's outline (alpha-2, alpha-3 or numeric code)
curl 'http://localhost:6800/maps/JP.svg?capital=true&dot=b5452c'   # with a dot on Tokyo
curl 'http://localhost:6800/maps/JP-13.svg?color=2f6b4f&lang=ja'   # Tokyo lit on Japan's prefectures, in green
curl 'http://localhost:6800/maps/CA-ON.svg'
```

| Parameter | What it does |
| --------- | ------------ |
| `color` | A fill for the country or the lit region, hex (`2f6b4f`). |
| `capital` | `true` puts a dot on a country's capital. A region's projection is its own, so a region has no capital dot. |
| `dot` | The capital's dot, hex. |
| `lang` | `en` or `ja`: the language of the map's label for a screen reader. |

A country's map is its outline (Natural Earth 1:50m) for 238 countries; a subdivision's is its country's regions with that one lit and framed, for the regions of 32 countries (Japan, Canada, the United States, Australia, the United Kingdom, Germany, France and more). Any other code is `404`, and a colour that is not hex `400`. Chizu is an optional peer dependency, like Hata (`npm install @johnmorrisdotca/chizu` beside this package; 22 MB of outlines, so `npx` does not install it), and is loaded the first time a map is asked for; each country's outline is its own small file. Without it, `/maps` is `501`, and the message says to run `npm install @johnmorrisdotca/chizu` beside this package. The copy of this API that runs inside a browser tab, as on the demo site, has no maps either (`501`), because Chizu's data is not part of that page. The Docker image carries Chizu, so its `/maps` works; from `npx`, install both packages in a project and run `npx rest-in-pieces` there.

## Geographic features: `/geo/features`

The named physical features of the world, from Chizu: oceans, seas, gulfs, bays and straits, lakes and reservoirs, rivers, deserts, mountain ranges, plateaus, plains, peninsulas and the other landforms, and peaks. The list is read from Chizu's feature files for the world and each of 238 countries (Natural Earth's physical vectors at 1:10m, public domain; names from Natural Earth and Wikidata, CC0), joined into one record each: a river through three countries, or a sea on four coasts, is one record with all of its countries. 2,790 on 2026-10-10. A **point and a box are served, never a shape**: a record is about 0.5 kB.

```sh
curl 'http://localhost:6800/geo/features/Q200239'                     # Lake Biwa: 琵琶湖, びわこ, a point and a box
curl 'http://localhost:6800/geo/features?kind=lake&countries=JP'       # a country's lakes
curl 'http://localhost:6800/geo/features?group=marine&rank[lte]=1'     # the big seas
curl 'http://localhost:6800/geo/features?q=琵琶'                         # a name in English, Japanese or kana
curl 'http://localhost:6800/countries/JP/features?kind=peak'           # Fuji and the rest, with elevation
curl 'http://localhost:6800/maps/JP.svg?features=water&feature=Q200239' # Japan's water with Lake Biwa lit
```

| Field | What it holds |
| ----- | ------------- |
| `id`, `wikidata` | The feature's Wikidata item (`Q200239`) where it has one, and then `wikidata` is the same; else Natural Earth's own id (`ne-…`) and `wikidata` is `null`. |
| `kind`, `group` | What it is (`ocean`, `sea`, `gulf`, `bay`, `strait`, `lake`, `reservoir`, `river`, `desert`, `range`, `peninsula`, `peak` and the rest) and its group: `marine`, `landforms`, `lakes`, `rivers` or `peaks`. A list is in that order, the biggest (lowest `rank`) first. |
| `name`, `names`, `reading` | The name in the locale (Japanese for `ja` where there is one, else English) and `{ en, ja }` (`ja` is `null` where neither Natural Earth nor Wikidata has one), and the Japanese name in kana where it is known. |
| `rank` | Natural Earth's scale rank: 0 for an ocean, up to 10 for a small lake or a short river. |
| `elevation` | A peak's height in metres, else `null`. |
| `location` | A point on it, `{ lat, lon }`: a peak itself, the middle of a river's course, a lake's or sea's labelling point (the point farthest from its edges). |
| `bbox` | The box round it, `{ west, south, east, north }` in degrees, `null` for a peak. A feature that crosses the 180th meridian (the Pacific, Fiji) has `west` greater than `east`, as in RFC 7946. For a feature on several countries' maps it is the box round what the maps draw. |
| `countries` | The alpha-2 codes of the countries whose map holds it, by Chizu's rules: a sea within 1.5% of the map's width of the coast, a lake or river with three tenths of it on the land, a landform or peak on the land. Empty for an ocean or sea that no country's map shows. Three places Chizu draws that have no ISO 3166-1 code (Ashmore and Cartier, the Indian Ocean Territories, the Siachen area) are left out. |
| `map` | A path from the API's base address to `/maps` with the feature lit (`maps/JP.svg?features=all&feature=Q200239`), on the map of the country that shows most of it; `null` where no country's map holds it. |

Filters are the fields: `kind=lake,reservoir`, `group=rivers`, `countries=JP`, `rank[lte]=2`, `wikidata=Q200239`; `q` searches every value, so a name in English, Japanese or kana finds it (`q=びわこ`). `/countries/{code}/features` lists a country's, and `expand=countries` on a feature embeds its countries. Capitals are not here: they are in `/countries` (`capital`, `capitalLocation`) and `/subdivisions`.

**On a map.** `/maps/{code}.svg` takes `features` (`water`, `all`, a group such as `peaks`, or a kind such as `strait`, several separated by commas) to draw the named features that fall on it, and `feature` (an `id` from this dataset) to light one, drawn even if its group is not named; a feature the map does not hold is `404`, and a `features` word that is none of those `400`. A subdivision's map takes them too, from its country's regions.

**Needs Chizu 1.2 or later.** Chizu is an optional peer dependency, like Hata: without it every request to `/geo/features`, `/geo/features/{id}` and `/countries/{code}/features` is `501`, and the message says to run `npm install @johnmorrisdotca/chizu` beside this package (a version without features says to update it). The first request reads Chizu's 239 feature files once, about 0.2 s and 25 MB while they are read; later ones answer from memory. The copy of this API inside a browser tab, as on the demo site, cannot load Chizu, so it has no Features tab; the static API on the demo site holds the whole dataset as files (`api/features.json`, `api/features/Q200239.json`, `api/countries/JP/features.json`, each also as CSV, NDJSON and SQL).

## Addresses: `/addresses`

Addresses in the United States, Canada, Japan, Australia, the United Kingdom, France and Germany, each in its own country's format and with a postcode that exists in the right region. They are invented: the street names are Faker's, and Japanese town names come from a short list of common ones (`JP_TOWNS`), so no address is a real person's; only the postcode is checked against the real tables.

```sh
curl 'http://localhost:6800/addresses?country=JP&limit=3'
curl 'http://localhost:6800/addresses?country=GB&limit=3&expand=subdivision'
curl 'http://localhost:6800/addresses?format=csv&limit=1000'
curl 'http://localhost:6800/addresses/validate?address=1+Main+St,+Sydney+VIC+2000'
curl 'http://localhost:6800/addresses/format?address=12+rue+de+la+Paix,+75002+Paris&country=FR'
```

A dataset of 1,000 for each `seed`, in the mix of seven (about 30% US, 14% Japan, 14% UK, 12% Canada, 11% each France and Germany, 8% Australia), the same for the same seed. `country=AU` and the other list parameters narrow it.

| Field | What it holds |
| ----- | ------------- |
| `country` | `US`, `CA`, `JP`, `AU`, `GB`, `FR` or `DE`: whose format the address is in. |
| `lines`, `formatted` | The address as its country's post writes it, a string a line (`["12 SMITH ST","PARRAMATTA NSW 2150"]` for Australia Post, `["〒100-0005","東京都千代田区丸の内1-2-3"]` for Japan Post), and the lines joined with a line break. |
| `latin` | Japan only: the address as English writes it, `1-2-3 Marunouchi, Chiyoda-ku, Tokyo 100-0005, Japan`. |
| `number`, `street`, `unit`, `city` | The parts. `unit` is a flat, apartment or unit in about one address in seven (not in Japan). A Japanese `street` is the town (町名) and its `number` the block (`1-2-3`). |
| `region`, `regionCode` | The state, province, prefecture, nation, department or Land in the country's own language, and its ISO 3166-2 code (`AU-NSW`, `GB-ENG`, `FR-69`, `DE-BY`, `JP-13`), which is a record in `/subdivisions`: `expand=subdivision` embeds it. |
| `postcode` | A postcode that exists in that region. |

**What "exists in the right region" means, per country**, from [address-plus](https://github.com/johnmorrisdotca/address-plus)'s tables, and what it does not:

| Country | The postcode comes from | The format |
| ------- | ----------------------- | ---------- |
| US | one of the state's ZIP prefixes (the first three digits USPS gives that state), then two digits | USPS: capitals, standard street types, unit after the street |
| Canada | a letter Canada Post uses for the province, then the rest of the pattern with the letters it uses | Canada Post |
| Japan | a prefix Japan Post delivers to the prefecture, then four digits that are checked to be delivered there too | the 〒 line, then prefecture, municipality, town and block |
| Australia | a number in one of the state's delivery blocks | Australia Post: the last line in capitals |
| United Kingdom | a postcode area and district Royal Mail has, with a unit and two letters; the nation follows from the district | Royal Mail: post town in capitals |
| France | one of the 6,328 postcodes in La Poste's base officielle, which names its department | La Poste: capitals without accents |
| Germany | one of the 10,813 postcodes in GeoNames' list for Germany, which names its Land | Deutsche Post |

The postcode is real and in the right region, and that is all that is promised: the street, the commune and the town are Faker's, so a French `17230` may sit beside the name of a town in another department. A test runs every one of the 1,000 default addresses through address-plus's validator and fails on a postcode that disagrees with its region.

`GET /addresses/validate?address=…&country=…` reads an address you give it and says what disagrees in it (`Postcode 2000 belongs to NSW, not VIC`), and `GET /addresses/format?address=…&country=…` writes it as its country's post does. `country` is one of the seven; without it the country is worked out from the address. An address is at most 300 characters, nothing is looked up on the network and nothing is kept.

## Withdrawn countries: `/countries/withdrawn`

The 31 entries of ISO 3166-3, the list of country names removed from ISO 3166-1: the Soviet Union (`SU`), Yugoslavia (`YU`), Czechoslovakia (`CS`), East Germany (`DD`), Zaire (`ZR`), East Timor (`TP`), the Netherlands Antilles (`AN`), Burma (`BU`) and the rest. They are never in `/countries`, so a country picker does not offer the USSR.

```sh
curl 'http://localhost:6800/countries/withdrawn/SU'          # by the four letters (SUHH), alpha-2, alpha-3 (SUN) or numeric (810) code
curl 'http://localhost:6800/countries/withdrawn?successors=RS&metadata=true'
curl 'http://localhost:6800/countries/withdrawn/YU?expand=successors'
curl 'http://localhost:6800/countries/withdrawn/SU/successors'
```

| Field | What it holds |
| ----- | ------------- |
| `code`, `alpha2`, `alpha3`, `numeric` | `SUHH`, `SU`, `SUN`, `810`; a code the successor still uses (Timor-Leste's numeric 626) is not a withdrawn code and is `null`. |
| `name`, `names` | The name in the locale (Japanese for `ja`, English otherwise) and `{ en, ja }`; `ja` is `null` where Wikidata has none. |
| `status` | Always `deleted`, as the old country list called it. |
| `since`, `until` | The years the alpha-2 code was in force (`1974` to `1992`), or a full day where Wikidata gives one. |
| `successors` | The alpha-2 codes of the countries that came after it, as ISO 3166-3 lists them; every record has at least one. They are current countries, except for Yugoslavia, whose successor `CS` is itself withdrawn. `expand=successors` embeds the current ones. |
| `reusedBy` | Set when a current country now holds the alpha-2 code: `BY` was the Byelorussian SSR and is Belarus. |

Where two countries held a code (`CS` was Czechoslovakia and then Serbia and Montenegro) `/countries/withdrawn/CS` is the one withdrawn last (`CSXX`), and the list holds both. That is also how a chain is followed: `YU` has the successor `CS`, so `expand=successors` on it is empty and `/countries/withdrawn/CS` (Serbia and Montenegro, whose successors are `ME` and `RS`) is the next step. The Soviet Union's successors are the thirteen countries ISO 3166-3 lists for it (`SU`'s record names no other).

## Data sources

| What | From | Licence |
| ---- | ---- | ------- |
| Country names, codes, currencies, continents, subregions, first day of the week, measurement, paper and clock | Unicode CLDR 48.2, through Kuni | Unicode-3.0 |
| Japanese names, capitals in Japanese, calling codes, population, area, coordinates, driving side, borders, Olympic codes, the withdrawn countries and their successors | Wikidata, through Kuni | CC0 |
| Own names, capitals and languages | countries-list, through Kuni | MIT |
| Time zones and top-level domains | IANA, through Kuni | Public domain; a list of facts |
| Land borders, confirmed | Natural Earth 1:50m, through Kuni | Public domain |
| Flags of countries and subdivisions | Wikimedia Commons files and flag-icons, optimised by Hata, which keeps each file's author and licence | Each file's own, kept in Hata's manifest; Hata is MIT |
| Country outlines and regions for maps | Natural Earth 1:50m, drawn by Chizu | Public domain; Chizu is MIT |
| Seas, lakes, rivers, landforms and peaks | Natural Earth's physical vectors at 1:10m (marine areas, lakes, rivers, geographic regions, elevation points), read from Chizu; their names from Natural Earth and Wikidata | Public domain (Natural Earth); CC0 (Wikidata); Chizu is MIT |
| Japan's prefectures, municipalities and the prefecture each postal code delivers to | Geolonia 住所データ; Japan Post's KEN_ALL through jp-postal, in address-plus | MIT |
| Australian postcode blocks | Australia Post's blocks and the Australian Bureau of Statistics' Postal Areas, in address-plus | CC BY 4.0 (the ABS) |
| British postcode areas and districts | Royal Mail's grammar and Ordnance Survey's Code-Point Open, in address-plus; contains Royal Mail data © Royal Mail copyright and database right 2026 | Open Government Licence v3 |
| French postcodes and departments | La Poste's base officielle and INSEE's departments, in address-plus | Licence Ouverte 2.0 |
| German postcodes | GeoNames' list for Germany, in address-plus | CC BY 4.0 |
| Street and place names in `/addresses` | Faker | MIT |
| The codes, years and successors of the withdrawn countries | ISO 3166-3's own table, written for Kuni 1.3 and pinned by a test there; Wikidata gives only the names | MIT; a list of facts |

Kuni's `NOTICE.md` has the full text of each licence. Nothing under ODbL, CC BY-SA or the GPL is used.
