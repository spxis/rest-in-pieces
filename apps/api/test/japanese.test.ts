import { describe, expect, it } from 'vitest';
import { DEPARTMENTS } from '../src/data/ja/catalog.ts';
import { FAMILY_NAMES, FEMALE_NAMES, MALE_NAMES } from '../src/data/ja/names.ts';
import { PREFECTURES } from '../src/data/ja/places.ts';
import { parseLocale } from '../src/lib/locale.ts';
import { type Envelope, postJson, request } from './helpers.ts';

type Row = Record<string, unknown>;

const KATAKANA = /^[゠-ヿ ]+$/;
const HAS_JAPANESE = /[぀-ヿ一-鿿]/;

describe('locale parameter', () => {
  it('defaults to en-CA and accepts common spellings of Japanese', () => {
    expect(parseLocale(undefined)).toBe('en-CA');
    expect(parseLocale('')).toBe('en-CA');
    expect(parseLocale('en')).toBe('en-CA');
    for (const value of ['ja', 'JA', 'ja-JP', 'ja_JP']) expect(parseLocale(value)).toBe('ja');
  });

  it('rejects locales it does not have with a 400', async () => {
    const { status, body } = await request<{ error: string }>('/names?locale=xx');
    expect(status).toBe(400);
    expect(body.error).toContain('en-CA, en-US');
  });

  it('labels every response with Content-Language and echoes it in metadata', async () => {
    const ja = await request('/users?locale=ja&limit=1');
    expect(ja.res.headers.get('content-language')).toBe('ja');
    expect(ja.body.metadata.parameters.locale).toBe('ja');
    const en = await request('/users?limit=1');
    expect(en.res.headers.get('content-language')).toBe('en-CA');
  });

  it('leaves the English datasets untouched', async () => {
    const { body } = await request<Envelope<Row>>('/names?limit=1');
    expect(body.results[0]).not.toHaveProperty('nameKana');
    expect(body.results[0]?.country).toBe('CA');
  });
});

describe('Japanese people', () => {
  it('writes names family name first, with katakana and romaji readings', async () => {
    const { body } = await request<Envelope<Row>>('/names?locale=ja&limit=50');
    for (const person of body.results) {
      const [family, given] = String(person.name).split(' ');
      const [familyKana, givenKana] = String(person.nameKana).split(' ');
      const familyName = FAMILY_NAMES.find((name) => name.kanji === family);
      const givenName = [...MALE_NAMES, ...FEMALE_NAMES].find((name) => name.kanji === given);
      expect(familyName?.kana).toBe(familyKana);
      expect(givenName?.kana).toBe(givenKana);
      expect(person.nameRomaji).toBe(`${familyName?.romaji} ${givenName?.romaji}`);
      expect(person.nameKana).toMatch(KATAKANA);
      expect(person.country).toBe('JP');
    }
  });

  it('keeps gender codes and given names consistent', async () => {
    const { body } = await request<Envelope<Row>>('/names?locale=ja&limit=100');
    for (const person of body.results) {
      const given = String(person.name).split(' ')[1];
      const list = person.gender === 'male' ? MALE_NAMES : FEMALE_NAMES;
      expect(list.some((name) => name.kanji === given)).toBe(true);
    }
  });

  it('places people in real prefectures and cities, and filters on them', async () => {
    const { body } = await request<Envelope<Row>>('/names?locale=ja&province=東京都&limit=1000');
    expect(body.results.length).toBeGreaterThan(50);
    const tokyo = PREFECTURES.find((prefecture) => prefecture.name === '東京都');
    for (const person of body.results) {
      expect(tokyo?.cities.some(([city]) => city === person.city)).toBe(true);
      expect(person.postal).toMatch(/^\d{3}-\d{4}$/);
    }
  });

  it('is repeatable per seed and differs between seeds', async () => {
    const [a, b, c] = await Promise.all([
      request('/names?locale=ja&seed=7&limit=5'),
      request('/names?locale=ja&seed=7&limit=5'),
      request('/names?locale=ja&seed=8&limit=5'),
    ]);
    expect(b.body.results).toEqual(a.body.results);
    expect(c.body.results).not.toEqual(a.body.results);
  });

  it('serves single records in Japanese', async () => {
    const { body } = await request<Row>('/names/0?locale=ja');
    expect(body.name).toMatch(HAS_JAPANESE);
  });
});

describe('Japanese users, products and companies', () => {
  it('gives users kanji names, readings, romaji logins and mobile numbers', async () => {
    const { body } = await request<Envelope<Row>>('/users?locale=ja&limit=20');
    for (const user of body.results) {
      expect(user.lastName).toMatch(HAS_JAPANESE);
      expect(user.lastNameKana).toMatch(KATAKANA);
      expect(user.email).toMatch(/^[a-z0-9._-]+@[a-z0-9.-]+$/);
      expect(user.phone).toMatch(/^0[789]0-\d{4}-\d{4}$/);
      expect(user.jobTitle).toMatch(HAS_JAPANESE);
    }
  });

  it('prices products in whole yen, as shops write them', async () => {
    const { body } = await request<Envelope<Row>>('/products?locale=ja&limit=100');
    for (const product of body.results) {
      expect(product.currency).toBe('JPY');
      expect(Number.isInteger(product.price)).toBe(true);
      expect(Number(product.price) % 100).toBeOneOf([0, 80]);
      expect(product.name).toMatch(HAS_JAPANESE);
    }
  });

  it('only pairs products with variants that suit them', async () => {
    const { body } = await request<Envelope<Row>>('/products?locale=ja&limit=1000');
    const allowed = new Set(
      DEPARTMENTS.flatMap((department) =>
        department.items.flatMap((item) => item.variants.map((variant) => `${department.name}|${item.name}${variant}`)),
      ),
    );
    for (const product of body.results) expect(allowed).toContain(`${product.department}|${product.name}`);
  });

  it('names companies the Japanese way, with romaji domains', async () => {
    const { body } = await request<Envelope<Row>>('/companies?locale=ja&limit=300');
    for (const company of body.results) {
      expect(company.name).toMatch(/^株式会社.+|.+株式会社$/);
      expect(company.website).toMatch(/^https:\/\/[a-z]+-[a-z]+\.example\.jp$/);
      expect(company.phone).toMatch(/^0\d{1,3}-\d{2,4}-\d{4}$/);
      expect(String(company.phone).replaceAll('-', '')).toHaveLength(10);
      // 020, 050, 060, 070, 080 and 090 are never office numbers.
      expect(company.phone).not.toMatch(/^0[256789]0-/);
    }
  });
});

describe('Japanese countries and custom data', () => {
  it('names countries in Japanese and still finds them by code', async () => {
    const { body } = await request<Row>('/countries/CAN?locale=ja');
    expect(body.name).toBe('カナダ');
    const list = await request<Row[]>('/countries?locale=ja&alpha2=JP');
    expect(list.body[0]?.name).toBe('日本');
  });

  it('generates custom records from the Japanese locale', async () => {
    const get = await request<Envelope<Row>>('/generate?locale=ja&fields=name:person.lastName&limit=5');
    for (const row of get.body.results) expect(row.name).toMatch(HAS_JAPANESE);
    const post = await postJson<Envelope<Row>>('/generate?locale=ja&limit=3', { fields: { name: 'person.lastName' } });
    expect(post.res.headers.get('content-language')).toBe('ja');
    expect(post.body.results).toHaveLength(3);
  });

  it('lists the fields each locale adds in /resources', async () => {
    const { body } = await request<{ name: string; locales: Record<string, { fields: string[] }> }[]>('/resources');
    const names = body.find((resource) => resource.name === 'names');
    expect(names?.locales.ja?.fields).toContain('nameKana');
    expect(names?.locales['en-CA']?.fields).not.toContain('nameKana');
  });
});
