import { describe, expect, it } from 'vitest';
import { request } from './helpers.ts';

type Failure = { error: string };

const json = { 'Content-Type': 'application/json' };

describe('a query parameter given twice', () => {
  it('is a 400 with the standard error body on every kind of route, never a validator dump', async () => {
    const calls: [string, string, RequestInit?][] = [
      ['list', '/users?limit=1&limit=2'],
      ['list, seed', '/users?seed=1&seed=2'],
      ['item', '/users/3?seed=1&seed=2'],
      ['nested list', '/users/3/orders?limit=1&limit=2'],
      ['an alias of a fixed parameter', '/users?size=1&size=2'],
      ['a range', '/users?id[gte]=1&id[gte]=2'],
      ['write', '/users/3?seed=1&seed=2', { method: 'PATCH', headers: json, body: '{"active":true}' }],
      ['create', '/users?locale=en-CA&locale=ja', { method: 'POST', headers: json, body: '{}' }],
      ['generate', '/generate?fields=a:person.fullName&count=1&count=2'],
      ['addresses', '/addresses/validate?address=a&address=b'],
      ['reset', '/reset?dataset=users&dataset=orders', { method: 'POST' }],
      [
        'sign in',
        '/auth/login?seed=1&seed=2',
        { method: 'POST', headers: json, body: '{"username":"a","password":"b"}' },
      ],
    ];
    for (const [name, path, init] of calls) {
      const { status, body } = await request<Failure>(path, init);
      expect(status, name).toBe(400);
      expect(Object.keys(body), name).toEqual(['error']);
      expect(body.error, name).toMatch(/^Invalid request/);
      expect(body.error, name).not.toContain('ZodError');
    }
  });

  it('names the parameter and says to give it once', async () => {
    const { body } = await request<Failure>('/users?limit=1&limit=2');
    expect(body.error).toBe('Invalid request at "limit": give it once, not 2 times');
  });

  it('is a list on a filter, as a comma list is', async () => {
    const all = await request<{ results: { city: string }[] }>('/users?limit=1000');
    const [first, second] = [...new Set(all.body.results.map((user) => user.city))];
    const both = await request<{ metadata: { total: number }; results: { city: string }[] }>(
      `/users?city=${encodeURIComponent(String(first))}&city=${encodeURIComponent(String(second))}&limit=1000`,
    );
    const commas = await request<{ metadata: { total: number } }>(
      `/users?city=${encodeURIComponent(`${first},${second}`)}&limit=1000`,
    );
    expect(both.status).toBe(200);
    expect(both.body.metadata.total).toBe(commas.body.metadata.total);
    expect(new Set(both.body.results.map((user) => user.city))).toEqual(new Set([first, second]));
  });
});
