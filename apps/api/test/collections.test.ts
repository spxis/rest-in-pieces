import { describe, expect, it } from 'vitest';
import { build } from '../src/data/build.ts';
import { makePerson } from '../src/data/people.ts';
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
    const collator = new Intl.Collator('en-CA', { numeric: true, sensitivity: 'variant' });
    expect(names).toEqual(names.toSorted((a, b) => collator.compare(b, a)));

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
    const people = () => build({ default: makePerson }, 20, 42, 'en-CA');
    expect(people()).toEqual(people());
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

describe('page and cursor paging', () => {
  const indexes = (body: Envelope<Person>) => body.results.map((p) => p.index);

  it('treats page and pageSize as aliases of offset and limit', async () => {
    const { res, body } = await request<Envelope<Person>>('/names?page=3&pageSize=20');
    const byOffset = await request<Envelope<Person>>('/names?offset=40&limit=20');
    expect(body.results).toEqual(byOffset.body.results);
    expect(indexes(body)[0]).toBe(40);
    expect(body.metadata.links).toMatchObject({
      self: '/names?page=3&pageSize=20',
      first: '/names?page=1&pageSize=20',
      prev: '/names?page=2&pageSize=20',
      next: '/names?page=4&pageSize=20',
      last: '/names?page=50&pageSize=20',
    });
    expect(res.headers.get('link')).toContain('</names?page=4&pageSize=20>; rel="next"');
    expect(indexes((await request<Envelope<Person>>('/names?page=2&limit=5')).body)).toEqual([5, 6, 7, 8, 9]);
    expect(indexes((await request<Envelope<Person>>('/names?page=0&limit=3')).body)).toEqual([0, 1, 2]);
  });

  it('walks every page by cursor, first to last and back', async () => {
    const query = 'gender=female&sortBy=age:numeric&max=40&seed=3';
    const all = (await request<Envelope<Person>>(`/names?${query}&limit=1000`)).body.results;
    expect(all.length).toBeGreaterThan(7);

    const seen: Person[] = [];
    let page = await request<Envelope<Person>>(`/names?${query}&limit=7&cursor=`);
    expect(page.body.metadata.prevCursor).toBeNull();
    const cursors: string[] = [];
    for (;;) {
      expect(page.status).toBe(200);
      seen.push(...page.body.results);
      const { nextCursor, links } = page.body.metadata;
      if (!nextCursor) break;
      expect(links.next).toContain(`cursor=${nextCursor}`);
      expect(page.res.headers.get('link')).toContain(`cursor=${nextCursor}>; rel="next"`);
      cursors.push(nextCursor);
      page = await request<Envelope<Person>>(`/names?${query}&limit=7&cursor=${nextCursor}`);
    }
    expect(seen).toEqual(all);
    expect(page.body.metadata.links.next).toBeNull();

    const back = await request<Envelope<Person>>(`/names?${query}&limit=7&cursor=${page.body.metadata.prevCursor}`);
    expect(back.body.metadata.nextCursor).toBe(cursors.at(-1));
  });

  it('offers cursors on every page, so a walk can start without one', async () => {
    const { body } = await request<Envelope<Person>>('/names?limit=5');
    expect(body.metadata.prevCursor).toBeNull();
    expect(body.metadata.links.next).toBe('/names?limit=5&offset=5');
    const next = await request<Envelope<Person>>(`/names?limit=5&cursor=${body.metadata.nextCursor}`);
    expect(indexes(next.body)).toEqual([5, 6, 7, 8, 9]);
  });

  it('keeps a cursor valid when only the page size or format changes', async () => {
    const { body } = await request<Envelope<Person>>('/names?limit=5&sortDirection=desc');
    const cursor = body.metadata.nextCursor;
    const wider = await request<Envelope<Person>>(`/names?sortOrder=desc&pageSize=10&cursor=${cursor}`);
    expect(indexes(wider.body)).toEqual([994, 993, 992, 991, 990, 989, 988, 987, 986, 985]);
    expect((await request(`/names?limit=5&sortDirection=desc&format=csv&cursor=${cursor}`)).status).toBe(200);
  });

  it('rejects a cursor once the query has changed', async () => {
    const { body } = await request<Envelope<Person>>('/names?gender=female&limit=5');
    const cursor = body.metadata.nextCursor;
    for (const changed of ['gender=male', 'gender=female&sortBy=age', 'gender=female&q=ont', 'gender=female&seed=2']) {
      const { status, body: error } = await request<{ error: string }>(`/names?${changed}&limit=5&cursor=${cursor}`);
      expect(status, changed).toBe(400);
      expect(error.error).toMatch(/different query/);
    }
    expect((await request(`/names?gender=female&locale=ja&limit=5&cursor=${cursor}`)).status).toBe(400);
    expect((await request(`/names?gender=female&max=50&limit=5&cursor=${cursor}`)).status).toBe(400);
  });

  it('rejects a cursor it did not issue', async () => {
    for (const cursor of ['nope', '%%%', btoa('2.10.abc')]) {
      const { status, body } = await request<{ error: string }>(`/names?cursor=${encodeURIComponent(cursor)}`);
      expect(status).toBe(400);
      expect(body.error).toMatch(/^Invalid cursor/);
    }
  });

  it('pages /generate the same way', async () => {
    const query = 'fields=name:person.fullName&count=12&limit=5';
    const first = await request<Envelope>(`/generate?${query}&cursor=`);
    const second = await request<Envelope>(`/generate?${query}&cursor=${first.body.metadata.nextCursor}`);
    expect(second.body.results.map((r) => r.index)).toEqual([5, 6, 7, 8, 9]);
    const paged = await request<Envelope>(`/generate?${query.replace('limit', 'pageSize')}&page=3`);
    expect(paged.body.results.map((r) => r.index)).toEqual([10, 11]);
    expect(paged.body.metadata.nextCursor).toBeNull();
    const changed = await request(
      `/generate?fields=email:internet.email&count=12&limit=5&cursor=${first.body.metadata.nextCursor}`,
    );
    expect(changed.status).toBe(400);
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
