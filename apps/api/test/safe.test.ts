import { describe, expect, it } from 'vitest';
import { createApp } from '../src/core.ts';
import { generatorTypes } from '../src/data/generators.ts';
import { forward } from '../src/lib/forward.ts';
import { LOCALES } from '../src/lib/locale.ts';
import {
  ALL_TEST_CARDS,
  avatarUrl,
  FICTION_RANGE_COUNTRIES,
  publicBase,
  safeEmail,
  safeEmailsIn,
  safeHost,
  safeIpv4,
  safeIpv6,
  safePhone,
  safeRecord,
  TEST_CARDS,
} from '../src/lib/safe.ts';
import type { Envelope } from './helpers.ts';

type Fields = Record<string, unknown>;

const app = createApp();
const get = async <T = Envelope>(path: string, init?: RequestInit) => {
  const res = await app.request(path, init);
  return { res, body: (await res.json()) as T };
};

const EXAMPLE_EMAIL = /^[^@\s]+@example\.(com|org|net)$/;
const SAFE_PHONE: Record<string, RegExp> = {
  CA: /^\d{3}-555-01\d{2}$/,
  US: /^\d{3}-555-01\d{2}$/,
  GB: /^07700 900\d{3}$/,
  DE: /^(030 23125|069 90009|040 66969|0221 4710|089 99998)\d{3}$/,
  FR: /^0[1-6] (99 00|61 91|53 01|65 71|36 49|39 98) \d{2} \d{2}$/,
};
const NANP_ELSEWHERE = /^\+1 555-01\d{2}$/;

/** The Luhn check every card number passes. */
function luhn(number: string): boolean {
  let sum = 0;
  [...number].reverse().forEach((digit, i) => {
    let value = Number(digit) * (i % 2 ? 2 : 1);
    if (value > 9) value -= 9;
    sum += value;
  });
  return sum % 10 === 0;
}

function inDocumentationRange(ip: string): boolean {
  if (ip.includes(':')) return /^2001:db8:/i.test(ip);
  return /^(192\.0\.2|198\.51\.100|203\.0\.113)\.\d{1,3}$/.test(ip);
}

describe('safe=true on the datasets', () => {
  it.each(LOCALES.map((l) => l.code))(
    'rewrites every user in %s to emails, phones and avatars that reach nobody',
    async (locale) => {
      const { body } = await get<Envelope<Fields>>(`/users?safe=true&limit=1000&locale=${locale}`);
      for (const user of body.results) {
        expect(user.email).toMatch(EXAMPLE_EMAIL);
        const country = String(user.country);
        expect(user.phone).toMatch(SAFE_PHONE[country] ?? NANP_ELSEWHERE);
        expect(String(user.avatar)).toMatch(/^http:\/\/localhost\/avatars\/[^/]+\.svg\?name=/);
      }
    },
  );

  it('keeps the part of an email before the @, and every other field as it was', async () => {
    const plain = (await get<Fields>('/users/7')).body;
    const safe = (await get<Fields>('/users/7?safe=true')).body;
    expect(String(safe.email).split('@')[0]).toBe(String(plain.email).split('@')[0]);
    const { email, phone, avatar, ...rest } = safe;
    const { email: _e, phone: _p, avatar: _a, ...restPlain } = plain;
    expect(rest).toEqual(restPlain);
    expect([email, phone, avatar].every((value) => typeof value === 'string')).toBe(true);
  });

  it('moves company sites and emails to the example domains, and their phones to the fiction ranges', async () => {
    const { body } = await get<Envelope<Fields>>('/companies?safe=true&limit=1000&locale=global');
    for (const company of body.results) {
      expect(company.website).toMatch(/^https:\/\/([a-z0-9-]+\.)?example\.(com|org|net)$/);
      expect(company.email).toMatch(/^hello@([a-z0-9-]+\.)?example\.(com|org|net)$/);
      expect(company.phone).toMatch(SAFE_PHONE[String(company.country)] ?? NANP_ELSEWHERE);
    }
  });

  it('gives a comment the same safe email as its commenter', async () => {
    const comment = (await get<Fields>('/comments/1?safe=true')).body;
    const user = (await get<Fields>(`/users/${comment.userId}?safe=true`)).body;
    expect(comment.email).toBe(user.email);
  });

  it('is what filters and search see, and leaves datasets with nothing to rewrite alone', async () => {
    const found = await get<Envelope<Fields>>('/users?safe=true&q=example.org&limit=1000');
    expect(found.body.metadata.total).toBeGreaterThan(100);
    expect(found.body.results.every((u) => String(u.email).endsWith('@example.org'))).toBe(true);
    expect((await get('/products?safe=true&limit=5')).body.results).toEqual(
      (await get('/products?limit=5')).body.results,
    );
    expect((await get('/users?safe=false&limit=5')).body.results).toEqual((await get('/users?limit=5')).body.results);
  });

  it('is the default with createApp({ safe: true }), and safe=false still asks for the old values', async () => {
    const safeApp = createApp({ safe: true });
    const user = (await (await safeApp.request('/users/1')).json()) as Fields;
    expect(user.email).toMatch(EXAMPLE_EMAIL);
    const plain = (await (await safeApp.request('/users/1?safe=false')).json()) as Fields;
    expect(plain).toEqual((await get('/users/1')).body);
    const generated = (await (
      await safeApp.request('/generate?fields=e:internet.email&metadata=false&limit=3')
    ).json()) as Fields[];
    expect(generated.every((r) => EXAMPLE_EMAIL.test(String(r.e)))).toBe(true);
  });

  it('writes avatar links under the prefix the API is mounted at', async () => {
    const mounted = await app.request('/users/1?safe=true', { headers: { 'X-Forwarded-Prefix': '/api' } });
    expect(((await mounted.json()) as Fields).avatar).toMatch(/^http:\/\/localhost\/api\/avatars\//);
    const odd = await app.request('/users/1?safe=true', { headers: { 'X-Forwarded-Prefix': 'javascript:alert(1)' } });
    expect(((await odd.json()) as Fields).avatar).toMatch(/^http:\/\/localhost\/avatars\//);
    const viaForward = await forward(app, '/mock', new Request('http://host.test/mock/users/1?safe=true'));
    expect(((await viaForward.json()) as Fields).avatar).toMatch(/^http:\/\/host\.test\/mock\/avatars\//);
  });
});

describe('safe=true on /generate', () => {
  const types = [
    'internet.email',
    'internet.url',
    'internet.domainName',
    'internet.domainSuffix',
    'internet.ip',
    'internet.ipv4',
    'internet.ipv6',
    'finance.creditCardNumber',
    'phone.number',
    'image.avatar',
    'image.avatarGitHub',
    'image.url',
    'image.urlPicsumPhotos',
    'git.commitEntry',
  ];

  it('draws every replaced type from the safe ranges, in every locale', async () => {
    expect(types.every((type) => generatorTypes.includes(type))).toBe(true);
    const fields = types.map((type, i) => `f${i}:${type}`).join(',');
    for (const { code, country } of LOCALES) {
      const { body } = await get<Fields[]>(
        `/generate?fields=${fields}&safe=true&metadata=false&limit=40&locale=${code}`,
      );
      for (const record of body) {
        const value = (type: string) => String(record[`f${types.indexOf(type)}`]);
        expect(value('internet.email')).toMatch(EXAMPLE_EMAIL);
        expect(value('internet.url')).toMatch(/^https:\/\/[a-z0-9-]+\.example\.(com|org|net)\/$/);
        expect(value('internet.domainName')).toMatch(/\.example\.(com|org|net)$/);
        expect(['com', 'org', 'net']).toContain(value('internet.domainSuffix'));
        for (const type of ['internet.ip', 'internet.ipv4', 'internet.ipv6'])
          expect(inDocumentationRange(value(type))).toBe(true);
        expect(ALL_TEST_CARDS).toContain(value('finance.creditCardNumber'));
        expect(value('phone.number')).toMatch(SAFE_PHONE[country] ?? NANP_ELSEWHERE);
        expect(value('image.avatar')).toMatch(/^http:\/\/localhost\/avatars\/\w+\.svg$/);
        expect(value('image.url')).toBe('http://localhost/images/640x480.svg');
        const emails = value('git.commitEntry').match(/<([^>]+)>/g) ?? [];
        expect(emails.every((email) => /@example\.(com|org|net)>$/.test(email))).toBe(true);
      }
    }
  });

  it('keeps arguments, and the same seed gives the same safe values', async () => {
    const url =
      '/generate?fields=c:finance.creditCardNumber(amex),i:image.url(320,200)&safe=true&metadata=false&limit=5&seed=8';
    const first = (await get<Fields[]>(url)).body;
    expect(first.every((r) => TEST_CARDS.amex?.includes(String(r.c)))).toBe(true);
    expect(first.every((r) => r.i === 'http://localhost/images/320x200.svg')).toBe(true);
    expect((await get<Fields[]>(url)).body).toEqual(first);
    const live = (await get<Fields[]>('/generate?fields=c:finance.creditCardNumber(visa)&metadata=false&limit=3')).body;
    expect(live.every((r) => String(r.c).replace(/\D/g, '').startsWith('4'))).toBe(true);
  });
});

describe('the safe helpers', () => {
  it('test cards pass the Luhn check and belong to their network', () => {
    for (const number of ALL_TEST_CARDS) expect(luhn(number), number).toBe(true);
    expect(TEST_CARDS.visa?.every((n) => n.startsWith('4'))).toBe(true);
    expect(TEST_CARDS.amex?.every((n) => /^3[47]/.test(n))).toBe(true);
  });

  it('phones come from each country’s fiction range, or the North American one', () => {
    for (let key = 0; key < 2000; key += 37) {
      for (const country of FICTION_RANGE_COUNTRIES)
        expect(safePhone(country, key)).toMatch(SAFE_PHONE[country] as RegExp);
      for (const country of ['JP', 'IN', 'CN', 'BR', 'RU', 'ID', 'KR', 'MX', 'VN']) {
        expect(safePhone(country, key)).toMatch(NANP_ELSEWHERE);
      }
      expect(inDocumentationRange(safeIpv4(key))).toBe(true);
      expect(inDocumentationRange(safeIpv6(key * 7919))).toBe(true);
    }
  });

  it('emails, hosts, bases and avatars', () => {
    expect(safeEmail('ada@example.org')).toBe('ada@example.org');
    expect(safeEmail('ada@mail.example.net')).toBe('ada@mail.example.net');
    expect(safeEmail('ada@gmail.com')).toMatch(/^ada@example\.(com|org|net)$/);
    expect(safeEmail('ada@gmail.com')).toBe(safeEmail('ada@gmail.com'));
    expect(safeEmail('no-at-sign')).toMatch(/^no-at-sign@example\./);
    expect(safeEmail('@x.com')).toMatch(/^user@example\./);
    expect(safeEmailsIn('From A <a@real.io> and b@real.co.uk.')).toMatch(/<a@example\.\w+> and b@example\.\w+\.$/);
    expect(safeHost('Café Ünïcode!', 0)).toBe('cafeunicode.example.com');
    expect(safeHost('', 1)).toBe('example.org');
    expect(publicBase('https://h.test/a/b?c', '/api/')).toBe('https://h.test/api');
    expect(publicBase('https://h.test/', '../x')).toBe('https://h.test');
    expect(publicBase('https://h.test/', undefined)).toBe('https://h.test');
    expect(avatarUrl('https://h.test', 'a b', '佐藤 美穂')).toBe(
      `https://h.test/avatars/a%20b.svg?name=${encodeURIComponent('佐藤 美穂')}`,
    );
    expect(safeRecord('names', { index: 0 }, { base: '' })).toEqual({ index: 0 });
    expect(safeRecord('users', { id: 1 }, { base: 'https://h.test' })).toEqual({ id: 1 });
    expect(safeRecord('companies', { id: 1 }, { base: '' })).toEqual({ id: 1 });
    expect(safeRecord('comments', { id: 1 }, { base: '' })).toEqual({ id: 1 });
  });

  it('documents safe on every data endpoint', async () => {
    const doc = (
      await get<{ paths: Record<string, Record<string, { parameters?: Array<{ name: string }> }>> }>('/openapi.json')
    ).body;
    for (const path of ['/users', '/orders', '/users/{id}', '/users/{id}/orders', '/generate']) {
      expect(
        doc.paths[path]?.get?.parameters?.map((p) => p.name),
        path,
      ).toContain('safe');
    }
  });
});
