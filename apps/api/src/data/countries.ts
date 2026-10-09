import { type Country, countries as countryData } from 'country-data';
import { type Locale, localeTag } from '../lib/locale.ts';

export type CountryRecord = Country;

/** Every country and territory, in the data set's own order. */
export const countries: readonly Country[] = countryData.all;

const translated = new Map<string, readonly Country[]>();

/**
 * Country names in the locale's language, from the runtime's own CLDR data; retired codes it doesn't know
 * keep their English name. English locales and the global mix keep the data set's own English names.
 */
export function localizedCountries(locale: Locale): readonly Country[] {
  const tag = localeTag(locale);
  if (!tag || tag.startsWith('en-')) return countries;
  let list = translated.get(tag);
  if (!list) {
    const names = new Intl.DisplayNames(tag, { type: 'region', fallback: 'none' });
    const nameOf = (country: Country) => {
      try {
        return names.of(country.alpha2) ?? country.name;
      } catch {
        return country.name;
      }
    };
    list = countries.map((country) => ({ ...country, name: nameOf(country) }));
    translated.set(tag, list);
  }
  return list;
}

/** Finds a country by ISO 3166 alpha-2 or alpha-3 code, ignoring case. */
export function findCountry(records: readonly Country[], code: string): Country | undefined {
  const needle = code.toUpperCase();
  return records.find((country) => country.alpha2 === needle || (country.alpha3 !== '' && country.alpha3 === needle));
}
