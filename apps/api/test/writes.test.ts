import { describe, expect, it } from 'vitest';
import { LOCALE_CODES } from '../src/lib/locale.ts';
import { resources } from '../src/resources.ts';
import { request } from './helpers.ts';

type Fields = Record<string, unknown>;
type Failure = { error: string; fields: Record<string, string> };

const send = <T = Fields>(method: string, path: string, body?: unknown) =>
  request<T>(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

const NEW: Record<string, Fields> = {
  names: {
    name: 'Ada Lovelace',
    age: 36,
    address: '12 St. George St',
    city: 'Toronto',
    province: 'Ontario',
    postal: 'M5S 2E5',
    country: 'CA',
    gender: 'female',
  },
  users: {
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
  },
  products: {
    sku: 'AE-001',
    name: 'Difference Engine',
    department: 'Tools',
    description: 'Tabulates polynomials.',
    price: 1999.99,
    currency: 'CAD',
    rating: 4.5,
    stock: 3,
    inStock: true,
  },
  companies: {
    name: 'Analytical Engines',
    industry: 'Computing',
    catchPhrase: 'Weaving algebraic patterns',
    website: 'https://example.com',
    email: 'hello@example.com',
    phone: '416-555-0100',
    employees: 12,
    founded: 1843,
    city: 'Toronto',
    province: 'Ontario',
    country: 'CA',
  },
};

const CHANGES: Record<string, Fields> = {
  names: { city: 'Halifax' },
  users: { city: 'Halifax', active: false },
  products: { stock: 0, inStock: false },
  companies: { employees: 40 },
};

const writable = resources.filter((resource) => resource.input);
const isoDate = (value: unknown) => typeof value === 'string' && !Number.isNaN(Date.parse(value));

describe('write routes', () => {
  it('exist on every generated dataset and nowhere else, as /resources says', async () => {
    expect(writable.map((resource) => resource.name)).toEqual(Object.keys(NEW));
    const { body } = await request<Array<{ name: string; writable: boolean }>>('/resources');
    expect(body.filter((resource) => resource.writable).map((resource) => resource.name)).toEqual(Object.keys(NEW));
  });

  for (const resource of writable) {
    const name = resource.name;
    const idField = resource.idField;
    const firstId = idField === 'index' ? 0 : 1;

    describe(`/${name}`, () => {
      it('creates: 201 with the next id, timestamps and a Location header', async () => {
        const { status, res, body } = await send('POST', `/${name}`, { ...NEW[name], [idField]: 7, createdAt: 'x' });
        expect(status).toBe(201);
        const next = firstId + 1000;
        expect(body).toMatchObject({ ...NEW[name], [idField]: next });
        expect(res.headers.get('location')).toBe(`/${name}/${next}`);
        expect(isoDate(body.createdAt)).toBe(true);
        expect(body.updatedAt).toBe(body.createdAt);
      });

      it('replaces: 200 with the same id and the body', async () => {
        const original = (await request<Fields>(`/${name}/${firstId + 4}`)).body;
        const { status, body } = await send('PUT', `/${name}/${firstId + 4}`, NEW[name]);
        expect(status).toBe(200);
        expect(body).toMatchObject({ ...NEW[name], [idField]: firstId + 4 });
        if ('createdAt' in original) expect(body.createdAt).toBe(original.createdAt);
        expect(isoDate(body.updatedAt)).toBe(true);
      });

      it('updates: 200 with the record merged with the fields sent', async () => {
        const original = (await request<Fields>(`/${name}/${firstId + 4}?seed=9`)).body;
        const { status, body } = await send('PATCH', `/${name}/${firstId + 4}?seed=9`, CHANGES[name]);
        expect(status).toBe(200);
        expect(body).toEqual({ ...original, ...CHANGES[name], updatedAt: body.updatedAt });
      });

      it('deletes: 204 with no body', async () => {
        const { status, text } = await send('DELETE', `/${name}/${firstId + 4}`);
        expect(status).toBe(204);
        expect(text).toBe('');
      });

      it('answers 404 for an id that does not exist, as GET does', async () => {
        for (const method of ['PUT', 'PATCH', 'DELETE']) {
          const body = method === 'DELETE' ? undefined : NEW[name];
          const { status, body: error } = await send<Failure>(method, `/${name}/${firstId + 1000}`, body);
          expect(status, method).toBe(404);
          expect(error.error).toMatch(/^No /);
        }
      });

      it('answers 409 with conflict=true', async () => {
        const calls = [
          ['POST', `/${name}?conflict=true`, NEW[name]],
          ['PUT', `/${name}/${firstId}?conflict=true`, NEW[name]],
          ['PATCH', `/${name}/${firstId}?conflict=true`, {}],
          ['DELETE', `/${name}/${firstId}?conflict=true`, undefined],
        ] as const;
        for (const [method, path, body] of calls) {
          const { status, body: error } = await send<Failure>(method, path, body);
          expect(status, method).toBe(409);
          expect(error.error, method).toBeTruthy();
        }
      });

      it('accepts every record it serves back as a PUT body, in every locale', () => {
        for (const locale of LOCALE_CODES) {
          for (const record of resource.load(1, locale).records) {
            const parsed = resource.input?.safeParse(record);
            expect(parsed?.success, `${locale}: ${JSON.stringify(parsed?.error?.issues)}`).toBe(true);
          }
        }
      });
    });
  }

  it('answers 422 with a message per field', async () => {
    const { status, body } = await send<Failure>('POST', '/users', { ...NEW.users, email: 'not-an-email' });
    expect(status).toBe(422);
    expect(body).toEqual({ error: 'Validation failed', fields: { email: 'Invalid email' } });

    const missing = await send<Failure>('POST', '/names', { name: 'Ada' });
    expect(missing.status).toBe(422);
    expect(missing.body.fields).toMatchObject({ age: 'Required', gender: 'Required', city: 'Required' });
    expect(missing.body.fields.name).toBeUndefined();

    const patched = await send<Failure>('PATCH', '/products/1', { price: -1, rating: 'great' });
    expect(patched.status).toBe(422);
    expect(Object.keys(patched.body.fields).sort()).toEqual(['price', 'rating']);

    const notAnObject = await send<Failure>('POST', '/companies', ['Analytical Engines']);
    expect(notAnObject.body).toEqual({ error: 'Validation failed', fields: { body: 'Expected a JSON object' } });
  });

  it('rejects malformed JSON, a body that is not JSON and a body over 64 KB', async () => {
    const malformed = await request<Failure>('/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"firstName": ',
    });
    expect(malformed.status).toBe(400);
    expect(malformed.body.error).toMatch(/Malformed JSON/);

    const plain = await request<Failure>('/users', { method: 'POST', body: 'firstName=Ada' });
    expect(plain.status).toBe(415);

    const huge = await send('POST', '/users', { ...NEW.users, jobTitle: 'x'.repeat(70 * 1024) });
    expect(huge.status).toBe(413);
  });

  it('is stateless: a write never changes what a later read returns', async () => {
    const before = (await request<Fields>('/users/2')).body;
    expect((await send('PATCH', '/users/2', { firstName: 'Changed' })).status).toBe(200);
    expect((await send('DELETE', '/users/2')).status).toBe(204);
    expect((await send('POST', '/users', NEW.users)).body.id).toBe(1001);
    expect((await request<Fields>('/users/2')).body).toEqual(before);
    expect((await request<Fields>('/users/1001')).status).toBe(404);
  });

  it('applies the simulation controls to writes', async () => {
    const down = await send('POST', '/users?status=503', NEW.users);
    expect(down.status).toBe(503);
    expect(down.res.headers.get('x-simulated')).toBe('true');
    expect((await send('DELETE', '/users/1?fail=true')).status).toBe(500);
    const accepted = await send('PATCH', '/users/1?status=202', { active: false });
    expect(accepted.status).toBe(202);
    expect(accepted.body.active).toBe(false);
    expect((await send('PUT', '/users/1?delay=5', NEW.users)).status).toBe(200);
  });

  it('leaves /countries and the /random-names alias read-only', async () => {
    expect((await send('POST', '/countries', { alpha2: 'ZZ' })).status).toBe(404);
    expect((await send('PATCH', '/countries/CA', { name: 'Canada' })).status).toBe(404);
    expect((await send('POST', '/random-names', NEW.names)).status).toBe(404);
  });

  it('documents each write with its body and responses', async () => {
    type Operation = { operationId: string; requestBody?: unknown; responses: Record<string, unknown> };
    const { body } = await request<{ paths: Record<string, Record<string, Operation>> }>('/openapi.json');
    for (const name of Object.keys(NEW)) {
      const list = body.paths[`/${name}`] ?? {};
      const item = body.paths[`/${name}/{id}`] ?? {};
      expect(Object.keys(list.post?.responses ?? {}).sort(), name).toEqual(['201', '401', '403', '409', '422', '507']);
      expect(list.post?.requestBody, name).toBeTruthy();
      for (const method of ['put', 'patch']) {
        expect(Object.keys(item[method]?.responses ?? {}).sort(), `${name} ${method}`).toEqual([
          '200',
          '401',
          '403',
          '404',
          '409',
          '422',
          '507',
        ]);
      }
      expect(Object.keys(item.delete?.responses ?? {}).sort(), name).toEqual([
        '204',
        '401',
        '403',
        '404',
        '409',
        '507',
      ]);
    }
    expect(Object.keys(body.paths['/countries/{id}'] ?? {})).toEqual(['get']);
    expect(Object.keys(body.paths['/random-names'] ?? {})).toEqual(['get']);
  });
});
