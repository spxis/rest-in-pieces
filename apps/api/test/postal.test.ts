import { CA_PROVINCES, getProvinceFromPostalCode, getStateFromZip, US_STATES } from '@spxis/address-plus';
import { describe, expect, it } from 'vitest';
import { postalFor } from '../src/data/postal.ts';
import { type Envelope, request } from './helpers.ts';

type Person = { province: string; postal: string; country: string };

/** The region a code belongs to, read by address-plus, against the region the record names. */
const regionsOf = ({ country, province, postal }: Person) =>
  country === 'CA'
    ? { named: CA_PROVINCES[province.toLowerCase()], coded: getProvinceFromPostalCode(postal) }
    : { named: US_STATES[province.toLowerCase()], coded: getStateFromZip(postal) };

describe('postal codes belong to the province or state named', () => {
  /*
   * Faker drew the province and the code separately: at seed 1, 924 of 1,000 en-CA records named one
   * province and carried another's code (a Newfoundland address with a Manitoba R8M), and 946 of 1,000
   * en-US records did the same with ZIP codes.
   */
  it.each([
    ['en-CA', 1],
    ['fr-CA', 1],
    ['en-US', 1],
    ['global', 1],
    ['en-CA', 42],
    ['en-US', 42],
  ])('/names?locale=%s&seed=%i', async (locale, seed) => {
    const { body } = await request<Envelope<Person>>(`/names?limit=1000&seed=${seed}&locale=${locale}`);
    const records = body.results.filter((person) => person.country === 'CA' || person.country === 'US');
    expect(records.length).toBeGreaterThan(0);
    const wrong = records.filter((person) => {
      const { named, coded } = regionsOf(person);
      return !named || coded !== named;
    });
    expect(wrong.map(({ province, postal }) => `${province} ${postal}`)).toEqual([]);
  });

  it('uses only the letters Canada Post does', async () => {
    const { body } = await request<Envelope<Person>>('/names?limit=1000&seed=1&locale=en-CA');
    expect(body.results.filter(({ postal }) => /[DFIOQU]/.test(postal)).map(({ postal }) => postal)).toEqual([]);
  });
});

describe('postalFor', () => {
  it("lays the province's prefix over the drawn code", () => {
    expect(postalFor('CA', 'Newfoundland and Labrador', 'R8M 8G0')).toBe('A8M 8G0');
    expect(postalFor('CA', 'Nunavut', 'R0Z 3J1')).toMatch(/^X0[ABC] 3J1$/);
  });

  it("lays the state's prefix over the drawn ZIP and keeps its +4", () => {
    const zip = postalFor('US', 'Massachusetts', '24926-5858');
    expect(getStateFromZip(zip)).toBe('MA');
    expect(zip).toMatch(/^\d{5}-5858$/);
  });

  it('chooses the same prefix for the same drawn code', () => {
    expect(postalFor('CA', 'Quebec', 'K5K 6F8')).toBe(postalFor('CA', 'Quebec', 'K5K 6F8'));
  });

  it('leaves other countries, and regions it does not know, as drawn', () => {
    expect(postalFor('DE', 'Bayern', '80331')).toBe('80331');
    expect(postalFor('CA', 'Atlantis', 'R8M 8G0')).toBe('R8M 8G0');
  });
});
