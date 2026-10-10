import { base, Faker } from '@faker-js/faker';
import {
  type CountryLocale,
  type CountryLocaleCode,
  countryLocale,
  GLOBAL,
  LOCALES,
  type Locale,
} from '../lib/locale.ts';

/** Builds the record at `index` from a locale's Faker instance, country and currency. */
export type Maker<T> = (locale: CountryLocale, index: number) => T;

/** The maker every locale uses, plus hand-built ones for locales that have them. */
export type Makers<T> = { default: Maker<T> } & Partial<Record<CountryLocaleCode, Maker<T>>>;

/** 32-bit FNV-1a, so each locale's stream is told apart by something that never changes. */
export function hash(text: string): number {
  let h = 0x811c9dc5;
  for (const char of text) h = Math.imul(h ^ (char.codePointAt(0) ?? 0), 0x01000193) >>> 0;
  return h;
}

/**
 * Seeds a locale's Faker. English (Canada) and Japanese keep the bare seed, so the datasets they served
 * before more locales arrived are unchanged; every other locale adds its own code, so locales that share
 * Faker's English names (en-US, en-GB) do not come out with the same people in the same order.
 */
function seedLocale(locale: CountryLocale, seed: number): void {
  if (locale.code === 'en-CA' || locale.code === 'ja') locale.faker.seed(seed);
  else locale.faker.seed([seed, hash(locale.code)]);
}

const MIX = LOCALES.map((value: CountryLocale) => ({ value, weight: value.weight }));

const picks = new Map<number, readonly CountryLocale[]>();

/**
 * The locale of each of the first `count` records of a `global` dataset at `seed`. Every dataset draws the same
 * sequence, so record `i` of `/users`, `/products` and `/names` share a locale, and the related datasets read a
 * user's or product's locale from here without building it.
 */
export function globalLocales(seed: number, count: number): readonly CountryLocale[] {
  const known = picks.get(seed);
  if (known && known.length >= count) return known.slice(0, count);
  const picker = new Faker({ locale: base });
  picker.seed([seed, hash(GLOBAL)]);
  const list = Array.from({ length: count }, () => picker.helpers.weightedArrayElement(MIX));
  if (picks.size >= 32) picks.delete(picks.keys().next().value as number);
  picks.set(seed, list);
  return list;
}

/**
 * Builds `count` records. A country locale builds them all from its own Faker; `global` chooses each
 * record's locale from the seed, weighted toward the bigger populations, so the same seed always gives
 * the same mix. Building is synchronous, so the shared Faker instances are never seeded mid-dataset.
 */
export function build<T>(makers: Makers<T>, count: number, seed: number, locale: Locale): T[] {
  const makerFor = (info: CountryLocale) => makers[info.code as CountryLocaleCode] ?? makers.default;
  if (locale !== GLOBAL) {
    const info = countryLocale(locale);
    seedLocale(info, seed);
    const make = makerFor(info);
    return Array.from({ length: count }, (_, index) => make(info, index));
  }
  const chosen = globalLocales(seed, count);
  const seeded = new Set<CountryLocale>();
  return Array.from({ length: count }, (_, index) => {
    const info = chosen[index] as CountryLocale;
    if (!seeded.has(info)) {
      seedLocale(info, seed);
      seeded.add(info);
    }
    return makerFor(info)(info, index);
  });
}

/**
 * The same records as `build`, made one at a time as they are asked for, so any number of them can be written out
 * without holding them. Nothing else may draw from the locale's Faker while this is being read, or the sequence
 * changes: it is for a process that does one thing, such as the `generate` command.
 */
export function* iterate<T>(makers: Makers<T>, count: number, seed: number, locale: Locale): Generator<T> {
  const makerFor = (info: CountryLocale) => makers[info.code as CountryLocaleCode] ?? makers.default;
  if (locale !== GLOBAL) {
    const info = countryLocale(locale);
    seedLocale(info, seed);
    const make = makerFor(info);
    for (let index = 0; index < count; index++) yield make(info, index);
    return;
  }
  // The same draws `globalLocales` makes, one at a time.
  const picker = new Faker({ locale: base });
  picker.seed([seed, hash(GLOBAL)]);
  const seeded = new Set<CountryLocale>();
  for (let index = 0; index < count; index++) {
    const info = picker.helpers.weightedArrayElement(MIX);
    if (!seeded.has(info)) {
      seedLocale(info, seed);
      seeded.add(info);
    }
    yield makerFor(info)(info, index);
  }
}
