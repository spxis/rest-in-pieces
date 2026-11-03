# Notice

REST in Pieces is MIT-licensed (see [LICENSE](LICENSE)). This package also carries other people's code and data,
under their own terms, and keeps their notices with it.

## Where the full licence texts are

| File in the package | What it covers |
| ------------------- | -------------- |
| `dist/THIRD-PARTY-LICENSES.md` | Every package copied into the browser entries `dist/element.js` and `dist/element-define.js` and their chunks `dist/embed-*.js`, with the full text of its licence and notice files. Written by the build from what went into those files. |
| `web/THIRD-PARTY-LICENSES.md` | The same for the playground in `web/`, which holds a copy of the API too: React, the icons, the fonts and the packages in the next table. |
| `node_modules/<package>/LICENSE` | The packages this one depends on and does not copy (`hono`, `zod`, `@faker-js/faker`, `yaml`, `fast-xml-parser`, `@johnmorrisdotca/kuni`, `@johnmorrisdotca/address-plus` and the rest of `dependencies`), installed with their own licence files. |

## Code copied into the browser entries and the playground

The browser entries and the playground are single bundles that run with no install, so they hold copies of these packages.

| Package | Licence |
| ------- | ------- |
| [hono](https://github.com/honojs/hono), [@hono/zod-openapi](https://github.com/honojs/middleware), [@hono/zod-validator](https://github.com/honojs/middleware) | MIT |
| [zod](https://github.com/colinhacks/zod) | MIT |
| [@asteasolutions/zod-to-openapi](https://github.com/asteasolutions/zod-to-openapi) | MIT |
| [@faker-js/faker](https://github.com/faker-js/faker) | MIT |
| [yaml](https://github.com/eemeli/yaml) | ISC |
| [fast-xml-parser](https://github.com/NaturalIntelligence/fast-xml-parser), fast-xml-builder, path-expression-matcher, xml-naming, fast-levenshtein, fastest-levenshtein | MIT |
| [@scalar/hono-api-reference](https://github.com/scalar/scalar) and the Scalar packages it uses | MIT |
| [@johnmorrisdotca/kuni](https://github.com/johnmorrisdotca/kuni) (countries and subdivisions, with their data) | MIT; its data under the terms in the next section |
| [react](https://github.com/facebook/react), react-dom and scheduler (the playground only) | MIT |
| [lucide-react](https://github.com/lucide-icons/lucide) (the playground only) | ISC |
| [@fontsource/ibm-plex-mono and @fontsource/space-grotesk](https://github.com/fontsource/font-files) (the playground only) | SIL Open Font License 1.1 |
| [@johnmorrisdotca/address-plus](https://github.com/johnmorrisdotca/address-plus) (address reading and postcode data) | MIT; its data under the terms in the next section |

## Data, and the credit it asks for

Kuni's data (Unicode CLDR, Wikidata, countries-list, Natural Earth, IANA) is under the terms in Kuni's own
`NOTICE.md`, which `dist/THIRD-PARTY-LICENSES.md` reproduces in full, with the Unicode-3.0 text:

- Unicode CLDR 48.2: Unicode-3.0. Copyright © 2004-2026 Unicode, Inc.
- Wikidata: CC0 1.0.
- countries-list by Annexare Studio: MIT.
- Natural Earth: public domain. IANA time zones and top-level domains: public domain, lists of facts.

The postcode and address data inside address-plus comes from these sources, and their licences ask for the
credit lines below:

- **Japan.** Prefectures and municipalities from [Geolonia 住所データ](https://github.com/geolonia/japanese-addresses)
  (MIT), and the prefecture each postal code delivers to from Japan Post's KEN_ALL file through
  [jp-postal](https://www.npmjs.com/package/jp-postal) (MIT).
- **Australia.** Based on Postal Areas data from the Australian Bureau of Statistics, licensed under
  [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/) (CC BY 4.0).
- **United Kingdom.** Contains OS data © Crown copyright and database right 2026 (Ordnance Survey Code-Point Open).
  Contains Royal Mail data © Royal Mail copyright and database right 2026. Licensed under the
  [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).
- **France.** La Poste's base officielle des codes postaux and INSEE's departments, under the
  [Licence Ouverte / Open Licence 2.0](https://www.etalab.gouv.fr/wp-content/uploads/2018/11/open-licence.pdf).
- **Germany.** Postcodes from [GeoNames](https://www.geonames.org/)' list for Germany, licensed under
  [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/) (CC BY 4.0).

Street and place names in `/addresses` come from Faker (MIT). Flags (Hata) and maps (Chizu) are optional
peer dependencies and are not part of this package; each carries its own notices.

The playground in `web/` uses the IBM Plex Mono and Space Grotesk fonts through Fontsource, under the SIL Open
Font License 1.1, whose text is in `web/THIRD-PARTY-LICENSES.md`.

Nothing in this package is under the ODbL, CC BY-SA or the GPL.
