import { type Country, countries as countryData } from 'country-data';

/** Every country and territory, in the data set's own order. */
export const countries: readonly Country[] = countryData.all;

/** Finds a country by ISO 3166 alpha-2 or alpha-3 code, ignoring case. */
export function findCountry(code: string): Country | undefined {
  const needle = code.toUpperCase();
  return countries.find((country) => country.alpha2 === needle || (country.alpha3 !== '' && country.alpha3 === needle));
}
