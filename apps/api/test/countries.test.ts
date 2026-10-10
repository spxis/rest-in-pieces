import { createRequire } from 'node:module';
import * as kuni from '@johnmorrisdotca/kuni';
import { describe, expect, it } from 'vitest';
import { type Envelope, request } from './helpers.ts';

/** `/countries` is made from Kuni. The old data set (`country-data`) is a dev dependency, here to be compared with. */
interface Old {
  alpha2: string;
  alpha3: string;
  name: string;
  status: string;
  ioc: string;
  emoji: string;
  currencies: string[];
  languages: string[];
  countryCallingCodes: string[];
}
const OLD_FIELDS = [
  'alpha2',
  'alpha3',
  'name',
  'status',
  'ioc',
  'emoji',
  'currencies',
  'languages',
  'countryCallingCodes',
];
const old = createRequire(import.meta.url)('country-data') as { countries: { all: Old[] } };
const oldCurrent = old.countries.all.filter((one) => one.status === 'assigned' || one.status === 'user assigned');

type Country = Old & Record<string, unknown>;
const list = async (query = ''): Promise<Country[]> => (await request<Country[]>(`/countries?limit=1000${query}`)).body;

describe('/countries, now made from Kuni', () => {
  it('serves the 250 current countries, with every field it had, under the same names and types', async () => {
    const countries = await list();
    expect(countries).toHaveLength(250);
    expect(countries.map((one) => one.alpha2)).toEqual(kuni.countries().map((one) => one.alpha2));
    for (const country of countries) {
      expect(Object.keys(country).slice(0, OLD_FIELDS.length), country.alpha2).toEqual(OLD_FIELDS);
      for (const field of ['alpha2', 'alpha3', 'name', 'status', 'ioc', 'emoji'] as const)
        expect(typeof country[field], `${country.alpha2} ${field}`).toBe('string');
      for (const field of ['currencies', 'languages', 'countryCallingCodes'] as const) {
        expect(Array.isArray(country[field]), `${country.alpha2} ${field}`).toBe(true);
        for (const one of country[field]) expect(typeof one).toBe('string');
      }
    }
  });

  it('keeps the codes, the flag and the status exactly as the old list had them, for every code it had', async () => {
    const countries = new Map((await list()).map((one) => [one.alpha2, one]));
    expect(oldCurrent).toHaveLength(250);
    for (const before of oldCurrent) {
      const now = countries.get(before.alpha2);
      expect(now, `${before.alpha2} is gone`).toBeDefined();
      expect(now?.alpha3, before.alpha2).toBe(before.alpha3);
      expect(now?.status, before.alpha2).toBe(before.status);
      expect(now?.emoji, before.alpha2).toBe(before.emoji);
    }
  });

  it('keeps the Olympic codes: the same as before wherever Wikidata agrees, and never one fewer than it needs to', async () => {
    const countries = new Map((await list()).map((one) => [one.alpha2, one]));
    const differing: string[] = [];
    for (const before of oldCurrent) {
      const now = countries.get(before.alpha2)?.ioc;
      if (before.ioc !== '' && now !== before.ioc) differing.push(`${before.alpha2} ${before.ioc} -> ${now}`);
    }
    // Wikidata is newer than country-data on these three, and has none for Guernsey and Jersey, whose codes (GCI, JCI)
    // are the Commonwealth Games Federation's.
    expect(differing.sort()).toEqual(['FO FAI -> FRO', 'GG GCI -> ', 'JE JCI -> ', 'LB LIB -> LBN', 'SG SIN -> SGP']);
    expect(countries.get('DE')?.ioc).toBe('GER');
    expect(countries.get('CH')?.ioc).toBe('SUI');
    expect(countries.get('AQ')?.ioc).toBe('');
  });

  it('names the countries as Kuni does in English, and says which names changed', async () => {
    const countries = new Map((await list()).map((one) => [one.alpha2, one]));
    const changed = oldCurrent.filter((before) => countries.get(before.alpha2)?.name !== before.name);
    // Kuni's names are CLDR's (South Korea, Russia); the old list's were ISO's short names (Korea, Republic Of).
    expect(changed.length).toBe(50);
    expect(countries.get('KR')?.name).toBe('South Korea');
    expect(countries.get('US')?.name).toBe('United States');
  });

  it("keeps languages as the three-letter codes the old list used, mapped from Kuni's two letters", async () => {
    const countries = await list();
    for (const country of countries)
      for (const code of country.languages) expect(code, country.alpha2).toMatch(/^[a-z]{3}$/);
    const match = oldCurrent.filter((before) => {
      const now = countries.find((one) => one.alpha2 === before.alpha2);
      return now?.languages[0] === before.languages[0];
    });
    // The most used language agrees for nearly every country.
    expect(match.length).toBeGreaterThan(225);
  });

  it("adds Kuni's fields: names in both languages, capital, time zones, population, area, borders and conventions", async () => {
    const jp = (await request<Country>('/countries/JP')).body;
    expect(jp).toMatchObject({
      alpha2: 'JP',
      alpha3: 'JPN',
      numeric: '392',
      name: 'Japan',
      ioc: 'JPN',
      emoji: '🇯🇵',
      names: { en: 'Japan', ja: '日本', native: '日本' },
      reading: 'にほん',
      continent: 'AS',
      callingCode: '+81',
      tld: 'jp',
      capital: { en: 'Tokyo', ja: '東京' },
      timeZones: ['Asia/Tokyo'],
      subdivisionType: 'prefecture',
      drivingSide: 'left',
      weekStart: 'sun',
      currencies: ['JPY'],
      languages: ['jpn'],
      countryCallingCodes: ['+81'],
    });
    expect(jp.population as number).toBeGreaterThan(100_000_000);
    expect(jp.areaKm2 as number).toBeGreaterThan(300_000);
    expect(jp.borders).toEqual([]);
    expect(((await request<Country>('/countries/FR')).body.borders as string[]).includes('DE')).toBe(true);
  });

  it('finds a country by alpha-2, alpha-3 or numeric code, in either case', async () => {
    for (const code of ['jp', 'JP', 'JPN', 'jpn', '392'])
      expect((await request<Country>(`/countries/${code}`)).body.alpha2, code).toBe('JP');
    expect((await request('/countries/ZZZ')).status).toBe(404);
  });

  it("names the countries in the locale: Kuni's Japanese for ja, the runtime's CLDR for the rest, English for en", async () => {
    expect((await request<Country>('/countries/JP?locale=ja')).body.name).toBe('日本');
    expect((await request<Country>('/countries/DE?locale=de')).body.name).toBe('Deutschland');
    expect((await request<Country>('/countries/JP?locale=en-US')).body.name).toBe('Japan');
    expect((await request<Country>('/countries/JP?locale=global')).body.name).toBe('Japan');
    // The other names stay put whatever the locale.
    expect((await request<Country>('/countries/JP?locale=de')).body.names).toEqual({
      en: 'Japan',
      ja: '日本',
      native: '日本',
    });
  });

  it('filters, sorts and searches the new fields as it does the old', async () => {
    const asia = await list('&continent=AS');
    expect(asia.length).toBeGreaterThan(40);
    expect(asia.every((one) => one.continent === 'AS')).toBe(true);
    const neighbours = await list('&borders=FR');
    expect(neighbours.map((one) => one.alpha2)).toEqual(expect.arrayContaining(['DE', 'ES', 'IT']));
    expect(neighbours.every((one) => (one.borders as string[]).includes('FR'))).toBe(true);
    const euro = await list('&currencies=EUR&q=land');
    expect(euro.map((one) => one.alpha2)).toEqual(expect.arrayContaining(['FI', 'IE']));
    const biggest = await list('&sortBy=population:numeric&sortDirection=desc');
    expect(
      biggest
        .slice(0, 2)
        .map((one) => one.alpha2)
        .sort(),
    ).toEqual(['CN', 'IN']);
    expect((await list('&tld=jp')).map((one) => one.alpha2)).toEqual(['JP']);
  });

  it('answers as a bare array by default and as an envelope with metadata=true, as before', async () => {
    expect(Array.isArray((await request('/countries?limit=3')).body)).toBe(true);
    const enveloped = await request<Envelope>('/countries?limit=3&metadata=true');
    expect(enveloped.body.metadata.total).toBe(250);
    expect(enveloped.body.results).toHaveLength(3);
  });

  it('serves csv, yaml and sql from the same records', async () => {
    const csv = (await request('/countries?limit=2&format=csv')).text;
    expect(csv.split('\n')[0]).toContain('alpha2,alpha3,name,status,ioc,emoji');
    expect((await request('/countries/JP?format=yaml')).text).toContain('alpha2: JP');
    expect((await request('/countries?limit=2&format=sql&table=country')).text).toContain('INSERT INTO "country"');
  });

  it('is read-only and has no seed', async () => {
    expect((await request('/countries?seed=2')).body).toEqual((await request('/countries?seed=1')).body);
  });

  it('is in /resources with its relations, and Postman and the OpenAPI document know its new fields', async () => {
    const catalog = (
      await request<{ name: string; path: string; fields: string[]; expand: string[]; nested: string[] }[]>(
        '/resources',
      )
    ).body;
    const countries = catalog.find((one) => one.name === 'countries');
    expect(countries?.fields.slice(0, 9)).toEqual(OLD_FIELDS);
    expect(countries?.fields).toContain('population');
    expect(catalog.find((one) => one.name === 'withdrawn')?.path).toBe('/countries/withdrawn');
    const spec = (
      await request<{ components: { schemas: Record<string, { properties: Record<string, unknown> }> } }>(
        '/openapi.json',
      )
    ).body;
    expect(Object.keys(spec.components.schemas.Country?.properties ?? {})).toContain('borders');
  });
});

describe('/countries/withdrawn', () => {
  type Withdrawn = {
    code: string;
    alpha2: string;
    alpha3: string | null;
    numeric: string | null;
    name: string;
    status: string;
    since: string;
    until: string;
    successors: string[];
    reusedBy: string | null;
  };

  it('lists the 31 countries ISO 3166-3 withdrew, none of them in /countries', async () => {
    const withdrawn = (await request<Envelope<Withdrawn>>('/countries/withdrawn?limit=100')).body;
    expect(withdrawn.metadata.total).toBe(31);
    const current = new Set((await list()).map((one) => one.alpha2));
    for (const one of withdrawn.results) {
      expect(one.status).toBe('deleted');
      expect(one.code).toMatch(/^[A-Z]{4}$/);
      expect(one.alpha2).toBe(one.code.slice(0, 2));
      expect(one.successors.length, one.code).toBeGreaterThan(0);
      expect(one.until > one.since, one.code).toBe(true);
      // A code a current country holds now says so, and /countries still means the country.
      if (current.has(one.alpha2)) expect(one.reusedBy).toBe(one.alpha2);
      else expect(one.reusedBy).toBeNull();
    }
    expect(withdrawn.results.map((one) => one.alpha2)).toEqual(
      expect.arrayContaining(['SU', 'YU', 'CS', 'DD', 'ZR', 'TP', 'AN', 'BU']),
    );
  });

  it('is not taken for a country code: /countries/withdrawn is the list, /countries/SU is not found', async () => {
    expect((await request('/countries/withdrawn')).status).toBe(200);
    expect((await request('/countries/SU')).status).toBe(404);
    expect((await request('/countries/SUHH')).status).toBe(404);
  });

  it('finds one by its four letters, alpha-2, alpha-3 or numeric code, the last withdrawn first', async () => {
    for (const code of ['SUHH', 'su', 'SUN', '810'])
      expect((await request<Withdrawn>(`/countries/withdrawn/${code}`)).body.code, code).toBe('SUHH');
    expect((await request<Withdrawn>('/countries/withdrawn/CS')).body.code).toBe('CSXX');
    expect((await request('/countries/withdrawn/JP')).status).toBe(404);
  });

  it('names the Soviet Union and its successors', async () => {
    const su = (await request<Withdrawn>('/countries/withdrawn/SU')).body;
    expect(su).toMatchObject({ name: 'Soviet Union', alpha3: 'SUN', numeric: '810', since: '1974', until: '1992' });
    expect(su.successors).toEqual(expect.arrayContaining(['RU', 'UA', 'KZ']));
    expect((await request<Withdrawn>('/countries/withdrawn/SU?locale=ja')).body.name).toBe('ソビエト連邦');
  });

  it('expands its successors into countries', async () => {
    const yu = (await request<{ successors: { alpha2: string }[] }>('/countries/withdrawn/YU?expand=successors')).body;
    expect(yu.successors.map((one) => one.alpha2)).toEqual(['BA', 'HR', 'ME', 'MK', 'RS', 'SI']);
    const nested = await request<Envelope<{ alpha2: string }>>(
      '/countries/withdrawn/SU/successors?metadata=true&limit=100',
    );
    expect(nested.body.results).toHaveLength(15);
  });

  it('filters by a country that came after: successors=RS', async () => {
    const found = (await request<Envelope<Withdrawn>>('/countries/withdrawn?successors=RS&limit=100')).body.results;
    expect(found.map((one) => one.code).sort()).toEqual(['CSXX', 'YUCS']);
  });
});
