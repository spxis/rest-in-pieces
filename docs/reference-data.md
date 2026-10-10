# Real places, invented people

[Back to the README.](https://github.com/spxis/rest-in-pieces#readme)

The people, companies, orders and messages REST in Pieces makes are invented, and none of them is a real person. The places they live in are real: a record from `en-CA` lives in Ontario, in Canada, and the country, the province, its capital, its flag and its postcode are the ones on the map. Real reference data about places is public fact, not personal data, so it is served as it is: the same way a test-data tool serves a real list of currencies. Nothing about a real person is in here, and nothing is ever added.

The reference data comes from the family of packages this project is part of: [Kuni](https://github.com/johnmorrisdotca/kuni) for countries and the regions inside them, [Hata](https://github.com/johnmorrisdotca/hata) for flags, [Chizu](https://github.com/johnmorrisdotca/chizu) for maps, [address-plus](https://github.com/johnmorrisdotca/address-plus) for addresses. Each is loaded the first time a request needs it, so starting the server, and every request that does not ask for a place, pays nothing for them. None of them is called while the server waits: nothing here runs on a timer, and every request is bounded.

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

A country's lists are `/countries/{code}/subdivisions` and `/countries/{code}/groupings`.

### What changed from the country-data list

`/countries` used to be made from the npm package `country-data`. It is made from Kuni now, which has everything that package had, and more. The nine old fields keep their names, order and types for every code, and a test compares them with the old list for all 250 (`apps/api/test/countries.test.ts`; `country-data` stays a dev dependency for it). The values that differ:

- **`name`** is CLDR's English name (`South Korea`, `Russia`, `Congo - Kinshasa`), not ISO's short form (`Korea, Republic Of`, `Russian Federation`). 50 countries differ.
- **`currencies`** are the ones in use now, from CLDR (Cuba is `["CUP"]`, not `["CUP","CUC"]`). 20 differ.
- **`countryCallingCodes`** hold the country calling code (`["+1"]`), not each area code the old list also gave (`["+7","+7 3","+7 4","+7 8"]`). 37 differ; `callingCode` is the same code as a string.
- **`languages`** are still three-letter codes (`eng`, `jpn`), mapped from Kuni's two-letter ones, and the most used language is the same for 230 of the 250. The lists themselves are Kuni's, so some are shorter or ordered differently.
- **`ioc`** is Wikidata's, newer than the old list on three (`FRO`, `LBN` and `SGP`, which the old list had as `FAI`, `LIB` and `SIN`); Guernsey and Jersey have none (the old list's `GCI` and `JCI` are the Commonwealth Games Federation's codes).
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
| `successors` | The alpha-2 codes of the current countries that came after it; every record has at least one. `expand=successors` embeds them. |
| `reusedBy` | Set when a current country now holds the alpha-2 code: `BY` was the Byelorussian SSR and is Belarus. |

Where two countries held a code (`CS` was Czechoslovakia and then Serbia and Montenegro) `/countries/withdrawn/CS` is the one withdrawn last, and the list holds both.

## Data sources

| What | From | Licence |
| ---- | ---- | ------- |
| Country names, codes, currencies, continents, subregions, first day of the week, measurement, paper and clock | Unicode CLDR 48.2, through Kuni | Unicode-3.0 |
| Japanese names, capitals in Japanese, calling codes, population, area, coordinates, driving side, borders, Olympic codes, the withdrawn countries and their successors | Wikidata, through Kuni | CC0 |
| Own names, capitals and languages | countries-list, through Kuni | MIT |
| Time zones and top-level domains | IANA, through Kuni | Public domain; a list of facts |
| Land borders, confirmed | Natural Earth 1:50m, through Kuni | Public domain |
| The few years, codes, names and successors of withdrawn countries that Wikidata lacks | Written for Kuni from the list ISO 3166-3 publishes | MIT; a list of facts |

Kuni's `NOTICE.md` has the full text of each licence. Nothing under ODbL, CC BY-SA or the GPL is used.
