/**
 * Postal codes that belong to the record's province or state.
 *
 * Faker draws a province and a postal code separately, so on its own a Newfoundland address came with a
 * Manitoba code (`R8M 8G0`), and most Canadian and US records named one region in `province` and another
 * in `postal`. A Canadian code's first letter, and a US ZIP code's first three digits, say which region
 * it belongs to; `@spxis/address-plus` holds those tables, and this lays the region's prefix over the
 * code Faker drew.
 *
 * The prefix is chosen from the drawn code itself, not from Faker, so no extra random draw is taken:
 * every other field at a seed is what it was before, and only `postal` moves.
 */

import { CA_PROVINCES, getPostalPrefixesForProvince, getZipPrefixesForState, US_STATES } from '@spxis/address-plus';
import { hash } from './build.ts';

/** Canada Post never uses D, F, I, O, Q or U; Faker's pattern does. Each becomes its neighbour. */
const CANADA_POST_LETTER: Record<string, string> = { D: 'C', F: 'G', I: 'J', O: 'P', Q: 'R', U: 'V' };

const regionPrefixes = (country: string, region: string): string[] => {
  const name = region.toLowerCase();
  if (country === 'CA') {
    const province = CA_PROVINCES[name];
    return province ? getPostalPrefixesForProvince(province) : [];
  }
  if (country === 'US') {
    const state = US_STATES[name];
    return state ? getZipPrefixesForState(state) : [];
  }
  return [];
};

/**
 * The drawn `postal` with `province`'s prefix laid over its start: `R8M 8G0` in Newfoundland and
 * Labrador becomes `A8M 8G0`, `24926-5858` in Massachusetts becomes `01926-5858`. Codes for other
 * countries, and regions the tables do not know, come back as drawn.
 */
export function postalFor(country: string, province: string, drawn: string): string {
  const prefixes = regionPrefixes(country, province);
  const prefix = prefixes[hash(drawn) % prefixes.length];
  if (prefix === undefined) return drawn;
  const code =
    country === 'CA'
      ? drawn.toUpperCase().replace(/[DFIOQU]/g, (letter) => CANADA_POST_LETTER[letter] ?? letter)
      : drawn;
  return prefix + code.slice(prefix.length);
}
