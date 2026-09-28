import { type Country, countries as countryData } from 'country-data';
import type { Locale } from '../lib/locale.ts';

export type CountryRecord = Country;

/** Every country and territory, in the data set's own order. */
export const countries: readonly Country[] = countryData.all;

const japaneseNames = new Intl.DisplayNames('ja', { type: 'region', fallback: 'none' });

function japaneseName(country: Country): string {
  try {
    return japaneseNames.of(country.alpha2) ?? country.name;
  } catch {
    return country.name;
  }
}

/** Japanese names come from the runtime's own CLDR data; retired codes it doesn't know keep their English name. */
const japanese: readonly Country[] = countries.map((country) => ({ ...country, name: japaneseName(country) }));

export function localizedCountries(locale: Locale): readonly Country[] {
  return locale === 'ja' ? japanese : countries;
}

/** Finds a country by ISO 3166 alpha-2 or alpha-3 code, ignoring case. */
export function findCountry(records: readonly Country[], code: string): Country | undefined {
  const needle = code.toUpperCase();
  return records.find((country) => country.alpha2 === needle || (country.alpha3 !== '' && country.alpha3 === needle));
}
