/**
 * Real reference data from the family's own packages, loaded when a request first needs it: countries from
 * `@johnmorrisdotca/kuni` (and its `/facts`). Nothing here runs at start-up and nothing is read twice: each `load…` call imports what it
 * needs once, builds frozen records, and every later call returns at once. The `…Records` functions are synchronous,
 * because the dataset layer is, and throw if the matching `load…` has not been awaited; `Resource.ready` is what awaits it
 * before a route reads.
 *
 * Wikidata's IOC codes and the withdrawn countries of ISO 3166-3 are Kuni's from 1.3.0; until it is installed, they are
 * read from `kuniLocal.ts`, made from Kuni's own build.
 */
import type { Country as KuniCountry } from '@johnmorrisdotca/kuni';
import type { CountryFacts, LatLon } from '@johnmorrisdotca/kuni/facts';
import { type Locale, localeTag } from '../lib/locale.ts';
import { ISO_639_3 } from './iso639.ts';
import { IOC_CODES, WITHDRAWN } from './kuniLocal.ts';

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
const countryByLocale = new Map<string, readonly CountryRecord[]>();
let loadingCountries: Promise<void> | undefined;

const countryRecord = (country: KuniCountry, facts: CountryFacts | null): CountryRecord => ({
  alpha2: country.alpha2,
  // Kosovo has no ISO alpha-3 code and never had one here.
  alpha3: country.kind === 'user' ? '' : country.alpha3,
  name: country.name.en,
  status: country.kind === 'user' ? 'user assigned' : 'assigned',
  ioc: IOC_CODES[country.alpha2] ?? '',
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
});

/** Imports Kuni's countries and their facts, once. */
export function loadCountries(): Promise<void> {
  loadingCountries ??= (async () => {
    const [kuni, facts] = await Promise.all([import('@johnmorrisdotca/kuni'), import('@johnmorrisdotca/kuni/facts')]);
    countryBase = freezeAll(kuni.countries().map((country) => countryRecord(country, facts.facts(country.alpha2))));
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
  const tag = localeTag(locale) ?? '';
  const japanese = tag === 'ja' || tag.startsWith('ja-');
  let list = withdrawnByLocale.get(japanese ? 'ja' : 'en');
  if (!list) {
    list = freezeAll(
      WITHDRAWN.map((one) => ({
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
