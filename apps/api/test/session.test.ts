import { describe, expect, it } from 'vitest';
import { createApp } from '../src/core.ts';
import { createSession, DEFAULT_SESSION_LIMITS, type SessionOption } from '../src/lib/session.ts';
import type { Envelope } from './helpers.ts';

type Fields = Record<string, unknown>;

const ADA = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  username: 'ada',
  email: 'ada@example.com',
  avatar: 'https://example.com/ada.png',
  phone: '416-555-0100',
  jobTitle: 'Analyst',
  company: 'Analytical Engines',
  city: 'Toronto',
  country: 'CA',
  active: true,
};

/** A fresh app, so every test starts from the seed. */
function client(session: SessionOption = true) {
  const app = createApp({ session });
  const call = async <T = Fields>(method: string, path: string, body?: unknown) => {
    const res = await app.request(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await res.text();
    return { res, status: res.status, body: (text ? JSON.parse(text) : null) as T };
  };
  return {
    get: <T = Envelope>(path: string) => call<T>('GET', path),
    send: call,
  };
}

describe('the session, off', () => {
  it('is the default: writes answer as before and change nothing', async () => {
    const api = client(false);
    expect((await api.send('POST', '/users', ADA)).status).toBe(201);
    expect((await api.send('DELETE', '/users/1')).status).toBe(204);
    expect((await api.get('/users/1')).status).toBe(200);
    expect((await api.get('/users?limit=1')).body.metadata.total).toBe(1000);
    expect((await api.get<{ enabled: boolean; datasets: unknown[] }>('/session')).body).toMatchObject({
      enabled: false,
      datasets: [],
    });
  });

  it('answers POST /reset harmlessly, so a test suite can call it either way', async () => {
    const { status, body } = await client(false).send<{ enabled: boolean; reset: number }>('POST', '/reset');
    expect(status).toBe(200);
    expect(body).toMatchObject({ enabled: false, reset: 0 });
  });
});

describe('the session, on', () => {
  it('keeps a create: the list, the count, the item and the next id all see it', async () => {
    const api = client();
    const created = await api.send('POST', '/users', ADA);
    expect(created.status).toBe(201);
    expect(created.body.id).toBe(1001);
    expect(created.res.headers.get('location')).toBe('/users/1001');

    const list = await api.get('/users?sortBy=id:numeric&sortDirection=desc&limit=1');
    expect(list.body.metadata.total).toBe(1001);
    expect(list.body.results[0]).toMatchObject({ id: 1001, username: 'ada' });
    expect(list.res.headers.get('x-total-count')).toBe('1001');
    expect((await api.get('/users?offset=1000')).body.results).toHaveLength(1);
    expect((await api.get<Fields>('/users/1001')).body).toMatchObject({ email: 'ada@example.com' });
    expect((await api.get('/users?q=ada@example.com')).body.metadata.total).toBe(1);

    expect((await api.send('POST', '/users', { ...ADA, username: 'babbage' })).body.id).toBe(1002);
  });

  it('keeps updates and deletes, and never gives a deleted id out again', async () => {
    const api = client();
    expect((await api.send('PATCH', '/users/2', { active: false })).status).toBe(200);
    expect((await api.get<Fields>('/users/2')).body.active).toBe(false);

    const replaced = await api.send('PUT', '/users/3', ADA);
    expect(replaced.body).toMatchObject({ id: 3, username: 'ada' });
    expect((await api.get<Fields>('/users/3')).body).toMatchObject({ username: 'ada', updatedAt: expect.any(String) });

    expect((await api.send('DELETE', '/users/4')).status).toBe(204);
    expect((await api.get('/users/4')).status).toBe(404);
    expect((await api.send('PATCH', '/users/4', { active: true })).status).toBe(404);
    expect((await api.get('/users?limit=1')).body.metadata.total).toBe(999);

    const made = await api.send('POST', '/users', ADA);
    expect((await api.send('DELETE', `/users/${made.body.id}`)).status).toBe(204);
    expect((await api.send('POST', '/users', ADA)).body.id).toBe(1002);
  });

  it('keeps each seed and locale apart, and leaves other datasets alone', async () => {
    const api = client();
    await api.send('DELETE', '/users/1');
    expect((await api.get('/users/1')).status).toBe(404);
    expect((await api.get('/users/1?seed=2')).status).toBe(200);
    expect((await api.get('/users/1?locale=ja')).status).toBe(200);
    expect((await api.get('/products/1')).status).toBe(200);
    await api.send('DELETE', '/names/0?locale=de');
    expect((await api.get('/names/0?locale=de')).status).toBe(404);
    // The deprecated alias reads the same people.
    expect((await api.get('/random-names/0?locale=de')).status).toBe(404);
  });

  it('lists what it holds, and POST /reset puts the seed back', async () => {
    const api = client();
    await api.send('POST', '/users', ADA);
    await api.send('PATCH', '/users/1', { active: false });
    await api.send('DELETE', '/companies/1');
    await api.send('PATCH', '/companies/2?seed=9', { employees: 3 });
    const state = await api.get<{ enabled: boolean; datasets: Fields[]; usage: { datasets: number; bytes: number } }>(
      '/session',
    );
    expect(state.body.enabled).toBe(true);
    expect(state.body.usage.datasets).toBe(3);
    expect(state.body.usage.bytes).toBeGreaterThan(0);
    expect(state.body.datasets).toContainEqual(
      expect.objectContaining({
        dataset: 'users',
        seed: 1,
        locale: 'en-CA',
        records: 1001,
        created: 1,
        updated: 1,
        deleted: 0,
      }),
    );

    const one = await api.send<{ reset: number; datasets: Fields[] }>('POST', '/reset?dataset=companies');
    expect(one.body.reset).toBe(2);
    expect(one.body.datasets.map((d) => d.dataset)).toEqual(['users']);
    expect((await api.get('/companies/1')).status).toBe(200);

    const all = await api.send<{ reset: number }>('POST', '/reset');
    expect(all.body.reset).toBe(1);
    expect((await api.get('/users?limit=1')).body.metadata.total).toBe(1000);
    expect((await api.get<Fields>('/users/1')).body.active).not.toBe(false);
  });

  it('sees what messy, filters and sorting see in the kept records', async () => {
    const api = client();
    await api.send('PATCH', '/names/0', { province: 'Yukon' });
    const yukon = await api.get('/names?province=Yukon&limit=1000');
    expect(yukon.body.results.map((r) => r.index)).toContain(0);
  });

  it('refuses a write it has no room for with 507, and keeps nothing of it', async () => {
    const api = client({ records: 1001 });
    expect((await api.send('POST', '/users', ADA)).status).toBe(201);
    const full = await api.send<{ error: string }>('POST', '/users', ADA);
    expect(full.status).toBe(507);
    expect(full.body.error).toContain('at most 1001 users');
    expect((await api.get('/users?limit=1')).body.metadata.total).toBe(1001);

    const few = client({ datasets: 1 });
    expect((await few.send('DELETE', '/companies/1')).status).toBe(204);
    expect((await few.send('DELETE', '/companies/1?seed=2')).status).toBe(507);
    expect((await few.get('/companies/1?seed=2')).status).toBe(200);
    // A user takes their orders, posts, todos, comments and reviews along, so it needs room for all of them or none.
    const two = await few.send<{ error: string }>('DELETE', '/users/1?seed=3');
    expect(two.status).toBe(507);
    expect(two.body.error).toContain('more datasets');
    expect((await few.get('/users/1?seed=3')).status).toBe(200);
    expect((await few.get('/users/1/orders?seed=3')).body.metadata.total).toBeGreaterThanOrEqual(0);

    const small = client({ bytes: 100 });
    expect((await small.send('POST', '/users', ADA)).status).toBe(507);
    expect((await small.get('/users?limit=1')).body.metadata.total).toBe(1000);
  });

  it('documents itself', async () => {
    const { body } = await client().get<{ paths: Record<string, Record<string, { tags: string[] }>> }>('/openapi.json');
    expect(body.paths['/session']?.get?.tags).toEqual(['Session']);
    expect(body.paths['/reset']?.post?.tags).toEqual(['Session']);
  });
});

describe('createSession', () => {
  it('has default limits, and a store for each app', () => {
    expect(createSession(true).summary().limits).toEqual(DEFAULT_SESSION_LIMITS);
    expect(createSession({ records: 5 }).summary().limits).toEqual({ ...DEFAULT_SESSION_LIMITS, records: 5 });
    expect(createSession(undefined).enabled).toBe(false);
  });

  it('is one store per app', async () => {
    const first = client();
    const second = client();
    await first.send('DELETE', '/users/1');
    expect((await first.get('/users/1')).status).toBe(404);
    expect((await second.get('/users/1')).status).toBe(200);
  });
});
