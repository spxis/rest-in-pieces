import * as main from '@johnmorrisdotca/address-plus';
import { australia } from '@johnmorrisdotca/address-plus/au';
import { germany } from '@johnmorrisdotca/address-plus/de';
import { france } from '@johnmorrisdotca/address-plus/fr';
import { unitedKingdom } from '@johnmorrisdotca/address-plus/gb';
import { describe, expect, it } from 'vitest';
import { ADDRESS_COUNTRIES } from '../src/data/addresses.ts';
import { type Envelope, request } from './helpers.ts';

interface Address {
  id: number;
  country: string;
  lines: string[];
  formatted: string;
  latin: string | null;
  number: string;
  street: string;
  unit: string | null;
  city: string;
  region: string;
  regionCode: string;
  postcode: string;
}

const countries = [australia, france, germany, unitedKingdom];
const addresses = async (query = ''): Promise<Address[]> =>
  (await request<Envelope<Address>>(`/addresses?limit=1000&${query}`)).body.results;

describe('/addresses', () => {
  it('makes 1000 addresses in seven countries, the same every time for a seed, and different for another', async () => {
    const all = await addresses();
    expect(all).toHaveLength(1000);
    expect(new Set(all.map((one) => one.country))).toEqual(new Set(ADDRESS_COUNTRIES));
    expect(await addresses()).toEqual(all);
    expect((await addresses('seed=2'))[0]).not.toEqual(all[0]);
    expect((await addresses('seed=2')).map((one) => one.country)).not.toEqual(all.map((one) => one.country));
  });

  it('writes each address as its country does, and says which lines', async () => {
    const all = await addresses();
    const of = (country: string) => all.filter((one) => one.country === country);
    for (const one of of('US')) {
      expect(one.lines).toHaveLength(2);
      expect(one.lines[1]).toMatch(/ [A-Z]{2} \d{5}$/);
      expect(one.lines[0]).toBe(one.lines[0]?.toUpperCase());
    }
    for (const one of of('CA'))
      expect(one.postcode).toMatch(/^[ABCEGHJKLMNPRSTVXY]\d[ABCEGHJKLMNPRSTVWXYZ] \d[ABCEGHJKLMNPRSTVWXYZ]\d$/);
    for (const one of of('JP')) {
      expect(one.postcode).toMatch(/^\d{3}-\d{4}$/);
      expect(one.lines[0]).toBe(`〒${one.postcode}`);
      expect(one.lines[1]).toContain(one.region);
      expect(one.latin).toContain('Japan');
    }
    for (const one of of('AU')) expect(one.lines.at(-1)).toMatch(/^[A-Z ]+ (NSW|VIC|QLD|WA|SA|TAS|ACT|NT) \d{4}$/);
    for (const one of of('GB')) expect(one.postcode).toMatch(/^[A-Z]{1,2}\d{1,2}[A-Z]? \d[A-Z]{2}$/);
    for (const one of of('FR')) expect(one.lines.at(-1)).toMatch(/^\d{5} [A-Z' -]+$/);
    for (const one of of('DE')) expect(one.lines.at(-1)).toMatch(/^\d{5} /);
    for (const one of all) {
      expect(one.formatted).toBe(one.lines.join('\n'));
      expect(one.latin === null || one.country === 'JP').toBe(true);
    }
  });

  it('gives every address a postcode that belongs to the region it names, as address-plus checks it', async () => {
    const all = await addresses();
    const mismatches: string[] = [];
    for (const one of all) {
      const text = one.country === 'JP' ? one.formatted.replace('\n', ' ') : one.lines.join(', ');
      const hint = one.country as 'US' | 'CA' | 'AU' | 'GB' | 'FR' | 'DE' | 'JP';
      const result = main.validateAddress(text, { countries, country: hint });
      if (
        result.errors.length > 0 ||
        result.warnings.some((warning) => /POSTAL|POSTCODE|ZIP/i.test(`${warning.code} ${warning.message}`))
      ) {
        mismatches.push(
          `${one.id} ${one.country} ${text}: ${[...result.errors, ...result.warnings].map((one) => (one as { message: string }).message).join('; ')}`,
        );
      }
    }
    expect(mismatches.slice(0, 5)).toEqual([]);
  });

  it('names the region by its ISO 3166-2 code, which is a record in /subdivisions', async () => {
    const all = await addresses();
    for (const one of all) expect(one.regionCode.startsWith(`${one.country}-`), one.id.toString()).toBe(true);
    const sample = all.slice(0, 140);
    const embedded = (
      await request<Array<Address & { subdivision: { code: string; level: number } | null }>>(
        '/addresses?limit=140&expand=subdivision&metadata=false',
      )
    ).body;
    expect(embedded).toHaveLength(sample.length);
    for (const one of embedded) {
      expect(one.subdivision, `${one.id} ${one.country} ${one.regionCode}`).not.toBeNull();
      expect(one.subdivision?.code).toBe(one.regionCode);
    }
  });

  it('filters by country and finds one by id', async () => {
    const japan = await addresses('country=JP');
    expect(japan.length).toBeGreaterThan(80);
    expect(japan.every((one) => one.country === 'JP')).toBe(true);
    const one = (await request<Address>('/addresses/7')).body;
    expect(one.id).toBe(7);
    expect((await request('/addresses/0')).status).toBe(404);
    expect((await request('/addresses/abc')).status).toBe(404);
  });

  it('has a unit in about one address in seven, outside Japan', async () => {
    const all = (await addresses()).filter((one) => one.country !== 'JP');
    const withUnit = all.filter((one) => one.unit !== null);
    expect(withUnit.length / all.length).toBeGreaterThan(0.08);
    expect(withUnit.length / all.length).toBeLessThan(0.25);
    for (const one of withUnit.slice(0, 20))
      expect(one.formatted.toLowerCase()).toContain((one.unit as string).split(' ')[1]?.toLowerCase());
  });
});

describe('/addresses/validate and /addresses/format', () => {
  it('check an address and say what disagrees in it', async () => {
    const good = (
      await request<{ isValid: boolean; warnings: unknown[]; parsedAddress: { country: string } }>(
        '/addresses/validate?address=3/12+Smith+St,+Parramatta+NSW+2150&country=AU',
      )
    ).body;
    expect(good.isValid).toBe(true);
    expect(good.warnings).toEqual([]);
    expect(good.parsedAddress.country).toBe('AU');
    const wrong = (
      await request<{ warnings: { message: string }[] }>('/addresses/validate?address=1+Main+St,+Sydney+VIC+2000')
    ).body;
    expect(wrong.warnings[0]?.message).toBe('Postcode 2000 belongs to NSW, not VIC');
    expect(
      (await request<{ warnings: unknown[] }>('/addresses/validate?address=東京都大阪市北区梅田1-1&country=JP')).body
        .warnings.length,
    ).toBeGreaterThan(0);
  });

  it('write an address as its country does', async () => {
    const lines = async (address: string, country?: string) =>
      (
        await request<{ country: string; format: string; lines: string[] }>(
          `/addresses/format?address=${encodeURIComponent(address)}${country ? `&country=${country}` : ''}`,
        )
      ).body;
    expect((await lines('12 smith st, parramatta nsw 2150')).lines).toEqual(['12 SMITH ST', 'PARRAMATTA NSW 2150']);
    expect(await lines('10 Downing Street, London SW1A 2AA')).toMatchObject({
      country: 'GB',
      format: 'royal-mail',
      lines: ['10 Downing Street', 'LONDON', 'SW1A 2AA'],
    });
    expect((await lines('12 rue de la Paix, 75002 Paris', 'FR')).lines).toEqual(['12 RUE DE LA PAIX', '75002 PARIS']);
    expect((await lines('Hauptstraße 12, 10115 Berlin', 'DE')).lines).toEqual(['Hauptstraße 12', '10115 Berlin']);
    expect((await lines('55 King St W, Toronto, ON M5H 1A1', 'CA')).format).toBe('canada-post');
    expect((await lines('123 Main St, Springfield, CA 90210')).format).toBe('usps');
    expect(await lines('〒100-0005 東京都千代田区丸の内1-2-3')).toMatchObject({
      country: 'JP',
      format: 'japan-post',
      lines: ['〒100-0005', '東京都千代田区丸の内1-2-3'],
    });
  });

  it('are bounded: an address is a few lines, a country is one of seven', async () => {
    expect((await request('/addresses/validate')).status).toBe(400);
    expect((await request('/addresses/validate?address=')).status).toBe(400);
    expect((await request(`/addresses/format?address=${'a'.repeat(301)}`)).status).toBe(400);
    expect((await request('/addresses/format?address=1+Main+St&country=BR')).status).toBe(400);
    expect((await request(`/addresses/format?address=${'a'.repeat(300)}`)).status).not.toBe(400);
    expect((await request('/addresses/format?address=%23%23%23')).status).toBe(422);
  });

  it('are not taken for an id of /addresses/{id}', async () => {
    expect((await request('/addresses/validate?address=1+Main+St,+Sydney+NSW+2000')).status).toBe(200);
    expect((await request('/addresses/1')).status).toBe(200);
  });
});
