/**
 * Real reference data from the family's own packages, loaded when a request first needs it: countries from
 * `@johnmorrisdotca/kuni` (and its `/facts`), subdivisions from `/load` or `/subdivisions` with `/subdivision-facts`,
 * groupings from `/groupings`. Nothing here runs at start-up and nothing is read twice: each `load…` call imports what it
 * needs once, builds frozen records, and every later call returns at once. The `…Records` functions are synchronous,
 * because the dataset layer is, and throw if the matching `load…` has not been awaited; `Resource.ready` is what awaits it
 * before a route reads.
 */
import type { Country as KuniCountry, Subdivision as KuniSubdivision } from '@johnmorrisdotca/kuni';
import type { CountryFacts, LatLon } from '@johnmorrisdotca/kuni/facts';
import type { Grouping } from '@johnmorrisdotca/kuni/groupings';
import type { SubdivisionFacts } from '@johnmorrisdotca/kuni/subdivision-facts';
import type { WithdrawnCountry } from '@johnmorrisdotca/kuni/withdrawn';
import { type Locale, localeTag } from '../lib/locale.ts';
import { flagUrlOf } from './flags.ts';
import { ISO_639_3 } from './iso639.ts';

type Point = { lat: number; lon: number };

/** A country as `/countries` serves it. The first nine fields are what the API served before it was made from Kuni. */
export interface CountryRecord {
  alpha2: string;
  alpha3: string;
  name: string;
  status: string;
  ioc: string;
  emoji: string;
  currencies: string[];
  languages: string[];
  countryCallingCodes: string[];
  numeric: string;
  names: { en: string; ja: string; native: string | null };
  shortName: { en: string | null; ja: string | null };
  reading: string | null;
  aliases: string[];
  continent: string;
  subregion: string | null;
  callingCode: string | null;
  tld: string | null;
  capital: { en: string; ja: string } | null;
  timeZones: string[];
  subdivisionType: string | null;
  population: number | null;
  populationYear: number | null;
  areaKm2: number | null;
  areaYear: number | null;
  location: Point | null;
  capitalLocation: Point | null;
  borders: string[];
  drivingSide: string | null;
  weekStart: string;
  measurement: string;
  paper: string;
  hourCycle: string;
  flag: string | null;
}

/** A subdivision (a state, a province, a prefecture, a county, a Land) as `/subdivisions` serves it. */
export interface SubdivisionRecord {
  code: string;
  country: string;
  shortCode: string;
  type: string | null;
  level: number;
  parent: string | null;
  name: string;
  names: { en: string; ja: string | null };
  reading: string | null;
  capital: { en: string; ja: string | null; reading: string | null } | null;
  population: number | null;
  populationYear: number | null;
  areaKm2: number | null;
  areaYear: number | null;
  location: Point | null;
  capitalLocation: Point | null;
  flag: string | null;
}

/** A grouping of countries (the EU, the G7, ASEAN, a continent) or of the subdivisions inside one country. */
export interface GroupingRecord {
  id: string;
  kind: string;
  name: string;
  names: { en: string; ja: string };
  shortName: { en: string | null; ja: string | null };
  reading: string | null;
  informal: boolean;
  country: string | null;
  parent: string | null;
  members: string[];
  memberCount: number;
  definition: string;
  note: string | null;
  source: { name: string; url: string; licence: string };
  asOf: string;
  periods: { code: string; since: string | null; until: string | null }[] | null;
  others: { code: string; status: string }[] | null;
}

/** A country that ISO 3166-3 lists as withdrawn from ISO 3166-1 (the Soviet Union, Yugoslavia, Zaire). */
export interface WithdrawnRecord {
  code: string;
  alpha2: string;
  alpha3: string | null;
  numeric: string | null;
  name: string;
  names: { en: string; ja: string | null };
  status: string;
  since: string;
  until: string;
  successors: string[];
  reusedBy: string | null;
}

const NOT_LOADED = (what: string) =>
  new Error(`${what} data is not loaded: await the dataset's ready() before reading it.`);

const pointOf = (point: LatLon | null | undefined): Point | null => (point ? { lat: point.lat, lon: point.lon } : null);
const freezeAll = <T extends object>(records: T[]): readonly T[] =>
  Object.freeze(records.map((one) => Object.freeze(one)));

// ----- Countries ---------------------------------------------------------------------------------------------------

let countryBase: readonly CountryRecord[] | undefined;
let withdrawnBase: readonly WithdrawnCountry[] | undefined;
const countryByLocale = new Map<string, readonly CountryRecord[]>();
let loadingCountries: Promise<void> | undefined;

const countryRecord = (country: KuniCountry, facts: CountryFacts | null): CountryRecord => ({
  alpha2: country.alpha2,
  // Kosovo has no ISO alpha-3 code and never had one here.
  alpha3: country.kind === 'user' ? '' : country.alpha3,
  name: country.name.en,
  status: country.kind === 'user' ? 'user assigned' : 'assigned',
  ioc: country.ioc ?? '',
  emoji: country.kind === 'user' ? '' : country.flag,
  currencies: [...(country.currency ?? [])],
  languages: (country.languages ?? []).map((code) => ISO_639_3[code] ?? code),
  countryCallingCodes: country.callingCode ? [country.callingCode] : [],
  numeric: country.numeric,
  names: { en: country.name.en, ja: country.name.ja, native: country.name.local ?? null },
  shortName: { en: country.shortName?.en ?? null, ja: country.shortName?.ja ?? null },
  reading: country.reading ?? null,
  aliases: [...(country.aliases ?? [])],
  continent: country.continent,
  subregion: country.subregion ?? null,
  callingCode: country.callingCode ?? null,
  tld: country.tld ?? null,
  capital: country.capital ? { en: country.capital.en, ja: country.capital.ja } : null,
  timeZones: [...(country.zones ?? [])],
  subdivisionType: country.subdivisionType ?? null,
  population: facts?.population ?? null,
  populationYear: facts?.populationYear ?? null,
  areaKm2: facts?.areaKm2 ?? null,
  areaYear: facts?.areaYear ?? null,
  location: pointOf(facts?.point),
  capitalLocation: pointOf(facts?.capitalPoint),
  borders: [...(facts?.borders ?? [])],
  drivingSide: facts?.drivingSide ?? null,
  weekStart: facts?.weekStart ?? 'mon',
  measurement: facts?.measurement ?? 'metric',
  paper: facts?.paper ?? 'A4',
  hourCycle: facts?.hourCycle ?? 'h23',
  flag: flagUrlOf(country.alpha2),
});

/** Imports Kuni's countries and their facts, once. */
export function loadCountries(): Promise<void> {
  loadingCountries ??= (async () => {
    const [kuni, facts, old] = await Promise.all([
      import('@johnmorrisdotca/kuni'),
      import('@johnmorrisdotca/kuni/facts'),
      import('@johnmorrisdotca/kuni/withdrawn'),
    ]);
    countryBase = freezeAll(kuni.countries().map((country) => countryRecord(country, facts.facts(country.alpha2))));
    withdrawnBase = old.withdrawnCountries();
  })();
  return loadingCountries;
}

/** Country names in the locale's language: Kuni's English or Japanese, the runtime's CLDR for the rest. */
export function countryRecords(locale: Locale): readonly CountryRecord[] {
  if (!countryBase) throw NOT_LOADED('Country');
  const tag = localeTag(locale);
  if (!tag || tag.startsWith('en-')) return countryBase;
  let list = countryByLocale.get(tag);
  if (!list) {
    const display =
      tag === 'ja' || tag.startsWith('ja-')
        ? undefined
        : new Intl.DisplayNames(tag, { type: 'region', fallback: 'none' });
    const nameOf = (country: CountryRecord): string => {
      if (!display) return country.names.ja;
      try {
        return display.of(country.alpha2) ?? country.name;
      } catch {
        return country.name;
      }
    };
    list = freezeAll(countryBase.map((country) => ({ ...country, name: nameOf(country) })));
    countryByLocale.set(tag, list);
  }
  return list;
}

/** Finds a country by ISO 3166 alpha-2 or alpha-3 code, or its numeric code, ignoring case. */
export function findCountry(records: readonly CountryRecord[], code: string): CountryRecord | undefined {
  const needle = code.trim().toUpperCase();
  if (needle === '') return undefined;
  return records.find(
    (country) =>
      country.alpha2 === needle || (country.alpha3 !== '' && country.alpha3 === needle) || country.numeric === needle,
  );
}

// ----- Withdrawn countries -----------------------------------------------------------------------------------------

const withdrawnByLocale = new Map<string, readonly WithdrawnRecord[]>();

/** The 31 withdrawn countries of ISO 3166-3, named in the locale's language (Japanese for `ja`, English otherwise). */
export function withdrawnRecords(locale: Locale): readonly WithdrawnRecord[] {
  if (!withdrawnBase) throw NOT_LOADED('Withdrawn country');
  const tag = localeTag(locale) ?? '';
  const japanese = tag === 'ja' || tag.startsWith('ja-');
  let list = withdrawnByLocale.get(japanese ? 'ja' : 'en');
  if (!list) {
    list = freezeAll(
      withdrawnBase.map((one) => ({
        code: one.code,
        alpha2: one.alpha2,
        alpha3: one.alpha3 ?? null,
        numeric: one.numeric ?? null,
        name: japanese ? (one.name.ja ?? one.name.en) : one.name.en,
        names: { en: one.name.en, ja: one.name.ja },
        status: 'deleted',
        since: one.since,
        until: one.until,
        successors: [...one.successors],
        reusedBy: one.reusedBy ?? null,
      })),
    );
    withdrawnByLocale.set(japanese ? 'ja' : 'en', list);
  }
  return list;
}

/** Finds a withdrawn country by its four-letter ISO 3166-3 code, or its alpha-2, alpha-3 or numeric code; the last withdrawn first. */
export function findWithdrawn(records: readonly WithdrawnRecord[], code: string): WithdrawnRecord | undefined {
  const needle = code.trim().toUpperCase();
  if (needle === '') return undefined;
  return [...records]
    .filter((one) => one.code === needle || one.alpha2 === needle || one.alpha3 === needle || one.numeric === needle)
    .sort((a, b) => (a.until < b.until ? 1 : a.until > b.until ? -1 : 0))[0];
}

// ----- Subdivisions ------------------------------------------------------------------------------------------------

const subdivisionsOf = new Map<string, readonly KuniSubdivision[]>();
const factsOf = new Map<string, ReadonlyMap<string, SubdivisionFacts>>();
const countryLoads = new Map<string, Promise<void>>();
let subdivisionVersion = 0;
const subdivisionsByLocale = new Map<string, readonly SubdivisionRecord[]>();
let allSubdivisionsLoaded: Promise<void> | undefined;

/** The countries a request's `country`, `code` or `parent` filter, or an id, names: `country=JP,US`, `JP-13`. */
export function countriesNamed(...values: (string | undefined)[]): string[] {
  const found = new Set<string>();
  for (const value of values) {
    for (const part of (value ?? '').split(',')) {
      const match = /^([A-Za-z]{2})(?:-|$)/.exec(part.trim());
      if (match) found.add((match[1] as string).toUpperCase());
    }
  }
  return [...found];
}

async function loadFactsFor(code: string): Promise<void> {
  if (factsOf.has(code)) return;
  const { loadSubdivisionFacts } = await import('@johnmorrisdotca/kuni/subdivision-facts');
  const list = (await loadSubdivisionFacts(code)) ?? [];
  factsOf.set(code, new Map(list.map((one) => [one.code, one])));
}

/** One country's subdivisions and facts, through Kuni's `/load` (one small import each); asked for once. */
function loadCountrySubdivisions(code: string): Promise<void> {
  let loading = countryLoads.get(code);
  if (!loading) {
    loading = (async () => {
      if (!subdivisionsOf.has(code)) {
        const { loadSubdivisions } = await import('@johnmorrisdotca/kuni/load');
        subdivisionsOf.set(code, (await loadSubdivisions(code)) ?? []);
      }
      await loadFactsFor(code);
      subdivisionVersion += 1;
    })();
    countryLoads.set(code, loading);
  }
  return loading;
}

/**
 * Loads the subdivisions, with their facts, of the countries named; all 200 of them when none is. A country with none
 * (most small ones) is not an error. Later calls load only what is new.
 */
export async function loadSubdivisionData(countries?: readonly string[]): Promise<void> {
  if (countries && countries.length > 0) {
    await Promise.all([...new Set(countries.map((code) => code.toUpperCase()))].map(loadCountrySubdivisions));
    return;
  }
  allSubdivisionsLoaded ??= (async () => {
    const [{ allSubdivisions }, { COUNTRY_CODES }] = await Promise.all([
      import('@johnmorrisdotca/kuni/subdivisions'),
      import('@johnmorrisdotca/kuni/codes'),
    ]);
    const byCountry = new Map<string, KuniSubdivision[]>();
    for (const one of allSubdivisions()) byCountry.set(one.country, [...(byCountry.get(one.country) ?? []), one]);
    for (const code of COUNTRY_CODES) {
      const list = byCountry.get(code);
      if (list && !subdivisionsOf.has(code)) subdivisionsOf.set(code, list);
    }
    await Promise.all([...byCountry.keys()].map(loadFactsFor));
    subdivisionVersion += 1;
  })();
  return allSubdivisionsLoaded;
}

const subdivisionRecord = (
  one: KuniSubdivision,
  facts: SubdivisionFacts | undefined,
  japanese: boolean,
): SubdivisionRecord => ({
  code: one.code,
  country: one.country,
  shortCode: one.shortCode,
  type: one.type ?? null,
  level: one.level,
  parent: one.parent ?? null,
  name: japanese ? (one.name.ja ?? one.name.en) : one.name.en,
  names: { en: one.name.en, ja: one.name.ja },
  reading: one.reading ?? null,
  capital: facts?.capital
    ? { en: facts.capital.en, ja: facts.capital.ja ?? null, reading: facts.capital.reading ?? null }
    : null,
  population: facts?.population ?? null,
  populationYear: facts?.populationYear ?? null,
  areaKm2: facts?.areaKm2 ?? null,
  areaYear: facts?.areaYear ?? null,
  location: pointOf(facts?.point),
  capitalLocation: pointOf(facts?.capitalPoint),
  flag: flagUrlOf(one.code),
});

/** Every subdivision loaded so far, country by country in Kuni's order, named in Japanese for `ja` and in English otherwise. */
export function subdivisionRecords(locale: Locale): readonly SubdivisionRecord[] {
  if (subdivisionsOf.size === 0 && subdivisionVersion === 0) throw NOT_LOADED('Subdivision');
  const tag = localeTag(locale) ?? '';
  const japanese = tag === 'ja' || tag.startsWith('ja-');
  const key = `${japanese ? 'ja' : 'en'}:${subdivisionVersion}`;
  let list = subdivisionsByLocale.get(key);
  if (!list) {
    for (const stale of subdivisionsByLocale.keys())
      if (!stale.endsWith(`:${subdivisionVersion}`)) subdivisionsByLocale.delete(stale);
    const records: SubdivisionRecord[] = [];
    for (const code of [...subdivisionsOf.keys()].sort()) {
      const facts = factsOf.get(code);
      for (const one of subdivisionsOf.get(code) ?? [])
        records.push(subdivisionRecord(one, facts?.get(one.code), japanese));
    }
    list = freezeAll(records);
    subdivisionsByLocale.set(key, list);
  }
  return list;
}

/** Finds a subdivision by its ISO 3166-2 code, ignoring case. */
export function findSubdivision(records: readonly SubdivisionRecord[], code: string): SubdivisionRecord | undefined {
  const needle = code.trim().toUpperCase();
  return records.find((one) => one.code === needle);
}

const folded = (text: string): string =>
  text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');

let regionIndex: { version: number; map: Map<string, SubdivisionRecord> } | undefined;

/**
 * The first-level subdivision a record's `province` names inside its `country`: Ontario in CA, 東京都 in JP. By English or
 * Japanese name, ignoring case, accents and spacing; `null` when the name is none of the country's (Faker's regions for
 * some locales are not ISO's).
 */
export function regionOf(country: unknown, province: unknown): SubdivisionRecord | null {
  if (typeof country !== 'string' || typeof province !== 'string') return null;
  if (!regionIndex || regionIndex.version !== subdivisionVersion) {
    const map = new Map<string, SubdivisionRecord>();
    for (const one of subdivisionRecords('en-CA')) {
      if (one.level !== 1) continue;
      for (const name of [one.names.en, one.names.ja]) if (name) map.set(`${one.country}|${folded(name)}`, one);
    }
    regionIndex = { version: subdivisionVersion, map };
  }
  return regionIndex.map.get(`${country.toUpperCase()}|${folded(province)}`) ?? null;
}

// ----- Groupings ---------------------------------------------------------------------------------------------------

let groupingBase: readonly GroupingRecord[] | undefined;
let loadingGroupings: Promise<void> | undefined;

const groupingRecord = (one: Grouping): GroupingRecord => ({
  id: one.id,
  kind: one.kind,
  name: one.name.en,
  names: { en: one.name.en, ja: one.name.ja },
  shortName: { en: one.shortName?.en ?? null, ja: one.shortName?.ja ?? null },
  reading: one.reading ?? null,
  informal: one.informal,
  country: one.country ?? null,
  parent: one.parent ?? null,
  members: [...one.members],
  memberCount: one.members.length,
  definition: one.definition,
  note: one.note ?? null,
  source: { name: one.source.name, url: one.source.url, licence: one.source.licence },
  asOf: one.asOf,
  periods: one.periods
    ? one.periods.map((period) => ({ code: period.code, since: period.since, until: period.until }))
    : null,
  others: one.others ? one.others.map((other) => ({ code: other.code, status: other.status })) : null,
});

/** Imports Kuni's 107 groupings, once. */
export function loadGroupings(): Promise<void> {
  loadingGroupings ??= (async () => {
    const { groupings } = await import('@johnmorrisdotca/kuni/groupings');
    groupingBase = freezeAll(groupings().map(groupingRecord));
  })();
  return loadingGroupings;
}

let groupingJapanese: readonly GroupingRecord[] | undefined;

/** The groupings, named in Japanese for `ja` and in English otherwise. */
export function groupingRecords(locale: Locale): readonly GroupingRecord[] {
  if (!groupingBase) throw NOT_LOADED('Grouping');
  const tag = localeTag(locale) ?? '';
  if (!(tag === 'ja' || tag.startsWith('ja-'))) return groupingBase;
  groupingJapanese ??= freezeAll(groupingBase.map((one) => ({ ...one, name: one.names.ja })));
  return groupingJapanese;
}

/** Finds a grouping by its id, ignoring case. */
export function findGrouping(records: readonly GroupingRecord[], id: string): GroupingRecord | undefined {
  const needle = id.trim().toLowerCase();
  return records.find((one) => one.id === needle);
}
