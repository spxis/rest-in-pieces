import { en } from '@faker-js/faker';
import { describe, expect, it } from 'vitest';
import { generateRecords, generatorTypes } from '../src/data/generators.ts';
import {
  type CountryLocale,
  type CountryLocaleCode,
  LOCALE_CODES,
  LOCALES,
  parseLocale,
  type Script,
} from '../src/lib/locale.ts';
import { type Envelope, request } from './helpers.ts';

type Row = Record<string, unknown>;

/**
 * Where Faker's data for each locale really comes from. `english` means Faker's shared English (US) lists:
 * native for en-US, a silent fallback elsewhere. Faker never says when it falls back, so this table says it,
 * and a Faker upgrade that adds or drops a locale's own data fails here until the table is brought up to date.
 */
type Source = 'native' | 'english' | 'mixed';

const EXPECTED: Record<CountryLocaleCode, { surnames: Source; streets: Source; postal: RegExp }> = {
  // Faker has no Canadian names or streets: both are its US English data.
  'en-CA': { surnames: 'english', streets: 'english', postal: /^[A-Z]\d[A-Z] \d[A-Z]\d$/ },
  'en-US': { surnames: 'english', streets: 'english', postal: /^\d{5}(-\d{4})?$/ },
  // Indian surnames, with English street types (Nair Motorway), which is how Indian English addresses read.
  'en-IN': { surnames: 'native', streets: 'english', postal: /^\d{3} \d{3}$/ },
  'zh-CN': { surnames: 'native', streets: 'native', postal: /^\d{6}$/ },
  'pt-BR': { surnames: 'native', streets: 'native', postal: /^\d{5}-\d{3}$/ },
  // British streets and postcodes, but Faker's US English names.
  'en-GB': { surnames: 'english', streets: 'mixed', postal: /^[A-Z]{1,2}[A-Z\d]{1,3} [A-Z\d]{3}$/ },
  ru: { surnames: 'native', streets: 'native', postal: /^\d{6}$/ },
  de: { surnames: 'native', streets: 'native', postal: /^\d{5}$/ },
  id: { surnames: 'native', streets: 'native', postal: /^\d{5}$/ },
  // Hand-built names; Faker's Japanese streets and postal codes.
  ja: { surnames: 'native', streets: 'native', postal: /^\d{3}-\d{4}$/ },
  fr: { surnames: 'native', streets: 'native', postal: /^\d{5}$/ },
  'fr-CA': { surnames: 'native', streets: 'native', postal: /^[A-Z]\d[A-Z] \d[A-Z]\d$/ },
  ko: { surnames: 'native', streets: 'native', postal: /^(\d{5}|\d{3}-\d{3})$/ },
  'es-MX': { surnames: 'native', streets: 'native', postal: /^\d{5}$/ },
  // Vietnamese names on English street types: "Toàn Thắng Plain", "Đào Junction".
  vi: { surnames: 'native', streets: 'english', postal: /^\d{5}$/ },
};

const ENGLISH_SURNAMES = new Set<string>((en.person?.last_name as { generic?: string[] } | undefined)?.generic ?? []);
const ENGLISH_STREET_TYPES = new Set<string>(en.location?.street_suffix ?? []);

/** Letters that are not the locale's script make a value suspect; Latin locales must be Latin only. */
const SCRIPT: Record<Script, RegExp> = {
  latin: /^[\p{Script=Latin}\p{M}\d\s.,'’()&/–-]+$/u,
  cyrillic: /\p{Script=Cyrillic}/u,
  han: /\p{Script=Han}/u,
  hangul: /\p{Script=Hangul}/u,
  japanese: /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u,
};

function inScript(script: Script, value: unknown): boolean {
  const text = String(value);
  return SCRIPT[script].test(text) && (script === 'latin' || !/[A-Za-z]/.test(text));
}

const share = (rows: readonly Row[], test: (row: Row) => boolean) => rows.filter(test).length / rows.length;

function expectSource(source: Source, fraction: number, what: string) {
  if (source === 'english') expect(fraction, what).toBeGreaterThanOrEqual(0.9);
  else if (source === 'native') expect(fraction, what).toBeLessThanOrEqual(0.1);
  else expect(fraction, what).toBeGreaterThan(0.1);
}

const list = async (path: string) => (await request<Envelope<Row>>(path)).body.results;

describe('the locale list', () => {
  it('accepts every code, its full tag and underscore spellings, and still rejects guesses', () => {
    for (const locale of LOCALES) {
      expect(parseLocale(locale.code)).toBe(locale.code);
      expect(parseLocale(locale.tag.toUpperCase())).toBe(locale.code);
      expect(parseLocale(locale.tag.replace('-', '_'))).toBe(locale.code);
    }
    expect(parseLocale('GLOBAL')).toBe('global');
    expect(parseLocale('en')).toBe('en-CA');
    expect(() => parseLocale('es')).toThrow(/Use one of: en-CA, en-US/);
  });

  it('serves /locales from the one list, the default first and the mix last', async () => {
    const { body } =
      await request<Array<{ code: string; tag: string | null; country: string | null; default: boolean }>>('/locales');
    expect(body.map((locale) => locale.code)).toEqual(LOCALE_CODES);
    expect(body.filter((locale) => locale.default).map((locale) => locale.code)).toEqual(['en-CA']);
    expect(body.at(-1)).toMatchObject({ code: 'global', tag: null, country: null });
    expect(body.find((locale) => locale.code === 'ko')).toMatchObject({ tag: 'ko-KR', country: 'KR', currency: 'KRW' });
  });

  it('documents every locale in the OpenAPI locale parameter', async () => {
    const { body } = await request<{
      paths: Record<string, { get: { parameters: Array<{ name: string; description: string }> } }>;
    }>('/openapi.json');
    const locale = body.paths['/names']?.get.parameters.find((parameter) => parameter.name === 'locale');
    for (const code of LOCALE_CODES) expect(locale?.description).toContain(`\`${code}\``);
    expect(body.paths).toHaveProperty('/locales');
  });

  it('lists each locale in /resources, and the fields the mix can carry', async () => {
    const { body } =
      await request<Array<{ name: string; locales: Record<string, { fields: string[] }> }>>('/resources');
    const names = body.find((resource) => resource.name === 'names');
    expect(Object.keys(names?.locales ?? {})).toEqual(LOCALE_CODES);
    expect(names?.locales.global?.fields).toEqual(expect.arrayContaining(['nameKana', 'country', 'province']));
    expect(body.find((resource) => resource.name === 'companies')?.locales.de?.fields).toContain('country');
  });
});

describe.each(LOCALES)('locale $code', (locale) => {
  const expected = EXPECTED[locale.code];
  const query = `locale=${locale.code}&limit=300`;

  it('writes people in its own script and formats, with its country', async () => {
    const people = await list(`/names?${query}`);
    for (const person of people) {
      expect(person.country).toBe(locale.country);
      expect(['male', 'female']).toContain(person.gender);
      for (const field of ['name', 'address', 'city', 'province']) {
        expect(inScript(locale.script, person[field]), `${field}: ${person[field]}`).toBe(true);
      }
      expect(person.postal).toMatch(expected.postal);
    }
    const streetType = (person: Row) =>
      ENGLISH_STREET_TYPES.has(String(person.address).trim().split(/\s+/).at(-1) ?? '');
    expectSource(expected.streets, share(people, streetType), 'streets on English street types');
  });

  it('gives users native surnames (or says where Faker falls back), logins and its country', async () => {
    const users = await list(`/users?${query}`);
    for (const user of users) {
      expect(user.country).toBe(locale.country);
      expect(inScript(locale.script, user.lastName), String(user.lastName)).toBe(true);
      expect(user.username).toMatch(/^[a-z0-9._-]+$/);
      expect(user.email).toMatch(/^[a-z0-9._-]+@[a-z0-9.-]+\.[a-z]+$/);
    }
    const english = (user: Row) =>
      String(user.lastName)
        .split(/[\s-]+/)
        .some((part) => ENGLISH_SURNAMES.has(part));
    expectSource(expected.surnames, share(users, english), 'surnames from the English list');
  });

  it('prices products in its currency', async () => {
    for (const product of await list(`/products?${query}`)) {
      expect(product.currency).toBe(locale.currency);
      expect(product.price).toBeGreaterThan(0);
      if (locale.priceScale >= 100) expect(Number.isInteger(product.price)).toBe(true);
    }
  });

  it('places companies in its country, with usable domains', async () => {
    for (const company of await list(`/companies?${query}&safe=false`)) {
      expect(company.country).toBe(locale.country);
      expect(inScript(locale.script, company.province)).toBe(true);
      expect(company.website).toMatch(/^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.example(\.jp)?$/);
    }
  });

  it('runs every /generate type and labels each record with its locale', async () => {
    const fields = generatorTypes.map((type, i) => ({ name: `f${i}`, type }));
    for (let i = 0; i < fields.length; i += 50) {
      expect(() => generateRecords(fields.slice(i, i + 50), 3, 1, locale.code)).not.toThrow();
    }
    const rows = await list(
      `/generate?locale=${locale.code}&fields=surname:person.lastName,country:locale.country,currency:locale.currency&limit=20`,
    );
    for (const row of rows) {
      expect(row).toMatchObject({ country: locale.country, currency: locale.currency });
      if (locale.script !== 'latin') expect(inScript(locale.script, row.surname), String(row.surname)).toBe(true);
    }
  });
});

describe('locale=global', () => {
  const countryOf = new Map<string, CountryLocale>(LOCALES.map((locale) => [locale.country, locale]));

  it('is the same mix for the same seed and a different one for another', async () => {
    const [a, b, c] = await Promise.all([
      list('/users?locale=global&seed=5&limit=50'),
      list('/users?locale=global&seed=5&limit=50'),
      list('/users?locale=global&seed=6&limit=50'),
    ]);
    expect(b).toEqual(a);
    expect(c).not.toEqual(a);
  });

  it('mixes every locale, weighted toward the bigger populations', async () => {
    const people = await list('/names?locale=global&limit=1000');
    const counts = Object.groupBy(people, (person) => String(person.country));
    expect(Object.keys(counts)).toHaveLength(new Set(LOCALES.map((locale) => locale.country)).size);
    expect(counts.US?.length).toBeGreaterThan(counts.KR?.length ?? 0);
    expect(counts.IN?.length).toBeGreaterThan(counts.FR?.length ?? 0);
    expect(people.map((person) => person.index)).toEqual(people.map((_, index) => index));
  });

  it('writes each record in the script of the country it names', async () => {
    for (const person of await list('/names?locale=global&limit=1000')) {
      const script = countryOf.get(String(person.country))?.script;
      expect(script).toBeDefined();
      if (script && script !== 'latin') expect(inScript(script, person.name), String(person.name)).toBe(true);
      if (person.country === 'JP') expect(person.nameKana).toBeDefined();
      else expect(person).not.toHaveProperty('nameKana');
    }
  });

  it('prices each product in its own currency and numbers every dataset from one', async () => {
    const currencies = new Set(LOCALES.map((locale) => locale.currency));
    const products = await list('/products?locale=global&limit=1000');
    for (const product of products) expect(currencies).toContain(product.currency);
    expect(new Set(products.map((product) => product.currency)).size).toBeGreaterThan(10);
    expect(products.map((product) => product.id)).toEqual(products.map((_, i) => i + 1));
    const companies = await list('/companies?locale=global&limit=200&country=DE');
    for (const company of companies) expect(company.country).toBe('DE');
  });

  it('mixes /generate records too, each drawn from its own locale', async () => {
    const path = '/generate?locale=global&fields=surname:person.lastName,country:locale.country&limit=300&seed=3';
    const [a, b] = await Promise.all([list(path), list(path)]);
    expect(b).toEqual(a);
    expect(new Set(a.map((row) => row.country)).size).toBeGreaterThan(8);
    for (const row of a) {
      const script = countryOf.get(String(row.country))?.script;
      if (script && script !== 'latin' && script !== 'japanese') expect(inScript(script, row.surname)).toBe(true);
    }
  });

  it('labels the response as the mix', async () => {
    const { res, body } = await request('/names?locale=global&limit=1');
    expect(res.headers.get('content-language')).toBeNull();
    expect(body.metadata.parameters.locale).toBe('global');
  });
});
