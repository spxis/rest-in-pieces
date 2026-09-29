import { describe, expect, it } from 'vitest';
import { generatePeople } from '../src/data/people.ts';
import { type Envelope, request } from './helpers.ts';

type Person = { index: number; name: string; age: number; gender: string; province: string };

describe('/names (legacy contract)', () => {
  it('returns the first 10 people in the metadata envelope', async () => {
    const { status, body } = await request<Envelope<Person>>('/names');
    expect(status).toBe(200);
    expect(body.results).toHaveLength(10);
    expect(body.results[0]?.index).toBe(0);
    expect(body.metadata).toMatchObject({ count: 10, total: 1000, output: { results: 'results' } });
    expect(Object.keys(body.results[0] ?? {})).toEqual([
      'index',
      'name',
      'age',
      'address',
      'city',
      'province',
      'postal',
      'country',
      'gender',
    ]);
  });

  it('is identical under /random-names', async () => {
    const [a, b] = await Promise.all([request('/names?limit=3'), request('/random-names?limit=3')]);
    expect(b.body.results).toEqual(a.body.results);
  });

  it('pages with offset, limit and their aliases', async () => {
    const { body } = await request<Envelope<Person>>('/names?offset=5&limit=5');
    expect(body.results.map((p) => p.index)).toEqual([5, 6, 7, 8, 9]);
    expect((await request('/names?offset=5&size=5')).body.results).toEqual(body.results);
    expect((await request('/names?offset=5&length=5')).body.results).toEqual(body.results);
  });

  it('caps the dataset with max so clients reach the end of the data', async () => {
    const { body } = await request<Envelope<Person>>('/names?max=25&offset=20&limit=10');
    expect(body.results.map((p) => p.index)).toEqual([20, 21, 22, 23, 24]);
    expect(body.metadata.total).toBe(25);
    expect(body.metadata.links.next).toBeNull();
  });

  it('sorts numerically, as text, and in reverse', async () => {
    const byAge = (await request<Envelope<Person>>('/names?limit=1000&sortBy=age:numeric')).body.results;
    const ages = byAge.map((p) => p.age);
    expect(ages).toEqual(ages.toSorted((a, b) => a - b));

    const byName = (await request<Envelope<Person>>('/names?limit=1000&sortBy=name&sortDirection=desc')).body.results;
    const names = byName.map((p) => p.name);
    expect(names).toEqual(names.toSorted((a, b) => b.localeCompare(a)));

    const reversed = (await request<Envelope<Person>>('/names?limit=2&sortDirection=reverse')).body.results;
    expect(reversed.map((p) => p.index)).toEqual([999, 998]);
  });

  it('drops the envelope when metadata is off, and renames the results key', async () => {
    for (const flag of ['0', 'false']) {
      const { body } = await request<unknown[]>(`/names?limit=3&metadata=${flag}`);
      expect(body).toHaveLength(3);
    }
    const { body } = await request<Record<string, unknown>>('/names?limit=2&resultsName=rows');
    expect(body.rows).toHaveLength(2);
    expect(body.results).toBeUndefined();
    const guarded = await request<Record<string, unknown>>('/names?limit=2&resultsName=metadata');
    expect(guarded.body.results).toHaveLength(2);
  });

  it('falls back to defaults for invalid numbers', async () => {
    const { status, body } = await request<Envelope<Person>>('/names?limit=abc&offset=-4');
    expect(status).toBe(200);
    expect(body.results).toHaveLength(10);
    expect(body.results[0]?.index).toBe(0);
  });
});

describe('seeds', () => {
  it('returns the same data for the same seed and different data for another', async () => {
    const [a, b, c] = await Promise.all([
      request('/users?limit=5&seed=7'),
      request('/users?limit=5&seed=7'),
      request('/users?limit=5&seed=8'),
    ]);
    expect(a.body.results).toEqual(b.body.results);
    expect(a.body.results).not.toEqual(c.body.results);
    expect(a.body.metadata.parameters.seed).toBe(7);
  });

  it('is stable across processes because generation depends only on the seed', () => {
    expect(generatePeople(20, 42)).toEqual(generatePeople(20, 42));
  });
});

describe('filtering and search', () => {
  it('filters by field with ranges and reports the filtered total', async () => {
    const { res, body } = await request<Envelope<Person>>('/names?gender=female&age[gte]=30&age[lt]=40&limit=1000');
    expect(body.results.length).toBeGreaterThan(0);
    for (const p of body.results) {
      expect(p.gender).toBe('female');
      expect(p.age).toBeGreaterThanOrEqual(30);
      expect(p.age).toBeLessThan(40);
    }
    expect(body.metadata.total).toBe(body.results.length);
    expect(res.headers.get('x-total-count')).toBe(String(body.results.length));
  });

  it('searches with q', async () => {
    const { body } = await request<Envelope<Person>>('/names?q=ontario&limit=1000');
    expect(body.results.length).toBeGreaterThan(0);
    expect(body.results.every((p) => JSON.stringify(p).toLowerCase().includes('ontario'))).toBe(true);
  });
});

describe('pagination headers and links', () => {
  it('sends X-Total-Count and an RFC 8288 Link header', async () => {
    const { res, body } = await request('/users?limit=10&offset=10');
    expect(res.headers.get('x-total-count')).toBe('1000');
    const link = res.headers.get('link') ?? '';
    expect(link).toContain('</users?limit=10&offset=0>; rel="first"');
    expect(link).toContain('</users?limit=10&offset=0>; rel="prev"');
    expect(link).toContain('</users?limit=10&offset=20>; rel="next"');
    expect(link).toContain('</users?limit=10&offset=990>; rel="last"');
    expect(body.metadata.links.next).toBe('/users?limit=10&offset=20');
    expect(res.headers.get('access-control-expose-headers')).toContain('X-Total-Count');
  });

  it('supports conditional requests with ETags', async () => {
    const first = await request('/products?limit=3');
    const etag = first.res.headers.get('etag');
    expect(etag).toBeTruthy();
    const again = await request('/products?limit=3', { headers: { 'If-None-Match': etag ?? '' } });
    expect(again.status).toBe(304);
  });
});

describe('item routes', () => {
  it('returns one record by id for each dataset', async () => {
    expect((await request<Person>('/names/42')).body.index).toBe(42);
    expect((await request<{ id: number }>('/users/1')).body.id).toBe(1);
    expect((await request<{ id: number }>('/products/1000')).body.id).toBe(1000);
    expect((await request<{ id: number }>('/companies/5')).body.id).toBe(5);
  });

  it('matches the record in the list for the same seed', async () => {
    const list = await request<Envelope<{ id: number }>>('/users?seed=9&offset=4&limit=1');
    const item = await request<{ id: number }>('/users/5?seed=9');
    expect(item.body).toEqual(list.body.results[0]);
  });

  it('returns 404 for ids that do not exist', async () => {
    for (const path of ['/names/1000', '/users/0', '/users/abc', '/countries/ZZZ']) {
      const { status, body } = await request<{ error: string }>(path);
      expect(status).toBe(404);
      expect(body.error).toMatch(/^No /);
    }
  });
});

describe('users, products and companies', () => {
  it('serve well-formed records', async () => {
    const users = (await request<Envelope<Record<string, unknown>>>('/users?limit=50')).body.results;
    for (const u of users) {
      expect(u.email).toMatch(/^[^@\s]+@[^@\s]+$/);
      expect(typeof u.active).toBe('boolean');
      expect(Number.isNaN(Date.parse(String(u.createdAt)))).toBe(false);
    }
    const products = (await request<Envelope<Record<string, unknown>>>('/products?limit=50')).body.results;
    for (const p of products) {
      expect(typeof p.price).toBe('number');
      expect(p.inStock).toBe((p.stock as number) > 0);
    }
    const companies = (await request<Envelope<Record<string, unknown>>>('/companies?limit=50')).body.results;
    for (const c of companies) expect(String(c.website)).toMatch(/^https:\/\//);
  });
});

describe('/countries', () => {
  it('returns every country as a bare array by default', async () => {
    const { body } = await request<unknown[]>('/countries');
    expect(body.length).toBeGreaterThan(200);
  });

  it('honours limit and offset, and the envelope on request', async () => {
    const all = (await request<unknown[]>('/countries')).body;
    expect((await request<unknown[]>('/countries?offset=10&limit=10')).body).toEqual(all.slice(10, 20));
    const enveloped = await request<Envelope>('/countries?limit=5&metadata=true');
    expect(enveloped.body.results).toHaveLength(5);
    expect(enveloped.body.metadata.parameters.seed).toBeNull();
  });

  it('looks countries up by alpha-2 or alpha-3 code', async () => {
    expect((await request<{ name: string }>('/countries/ca')).body.name).toBe('Canada');
    expect((await request<{ name: string }>('/countries/CAN')).body.name).toBe('Canada');
  });

  it('filters and searches real data', async () => {
    const { body } = await request<Array<{ name: string }>>('/countries?currencies=EUR&q=land');
    expect(body.map((c) => c.name)).toContain('Finland');
  });
});
