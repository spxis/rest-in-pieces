import { describe, expect, it } from 'vitest';
import {
  generateRecords,
  generatorTypes,
  parseFieldList,
  SchemaError,
  validateFields,
} from '../src/data/generators.ts';
import { type Envelope, postJson, request } from './helpers.ts';

describe('generator registry', () => {
  it('offers hundreds of argument-free generators, grouped by module', async () => {
    expect(generatorTypes.length).toBeGreaterThan(150);
    expect(generatorTypes).toEqual(generatorTypes.toSorted());
    const { body } = await request<{ generators: string[]; modules: Record<string, string[]> }>('/generators');
    expect(body.generators).toEqual(generatorTypes);
    expect(body.modules.person).toContain('fullName');
  });

  it('only exposes allow-listed modules and never helpers, seeding or internals', () => {
    for (const type of generatorTypes) {
      expect(type).toMatch(/^[a-z]+\.[a-zA-Z0-9]+$/);
      expect(type).not.toMatch(/^(helpers|faker|rawDefinitions|definitions)\.|\.(constructor|seed)$/);
    }
  });

  it('every generator produces a value', () => {
    const fields = generatorTypes.map((type, i) => ({ name: `f${i}`, type }));
    for (let i = 0; i < fields.length; i += 50) {
      const [record] = generateRecords(fields.slice(i, i + 50), 1, 1);
      for (const field of fields.slice(i, i + 50)) expect(record?.[field.name]).not.toBeUndefined();
    }
  });

  it('validates field lists', () => {
    expect(parseFieldList('name:person.fullName, email:internet.email')).toEqual([
      { name: 'name', type: 'person.fullName' },
      { name: 'email', type: 'internet.email' },
    ]);
    const bad = [
      '',
      'name',
      'a:b:c',
      '1st:person.firstName',
      'index:person.firstName',
      'a:x.y',
      'a:helpers.arrayElement',
    ];
    for (const list of bad) expect(() => parseFieldList(list)).toThrow(SchemaError);
    expect(() =>
      validateFields([
        { name: 'a', type: 'person.firstName' },
        { name: 'a', type: 'person.lastName' },
      ]),
    ).toThrow(/more than once/);
    expect(() => validateFields([])).toThrow(SchemaError);
  });
});

describe('GET /generate', () => {
  it('builds repeatable records with an index and the requested fields', async () => {
    const path = '/generate?fields=name:person.fullName,email:internet.email&limit=3&seed=42';
    const [a, b] = await Promise.all([request(path), request(path)]);
    expect(a.status).toBe(200);
    expect(a.body.results).toEqual(b.body.results);
    expect(Object.keys(a.body.results[0] ?? {})).toEqual(['index', 'name', 'email']);
    expect(a.body.metadata).toMatchObject({ total: 1000, parameters: { seed: 42 } });
  });

  it('sizes the dataset with count or max, and supports sorting and filtering', async () => {
    const { body } = await request<Envelope<{ age: number }>>(
      '/generate?fields=age:number.int&count=20&limit=100&sortBy=age:numeric',
    );
    expect(body.metadata.total).toBe(20);
    const ages = body.results.map((r) => r.age);
    expect(ages).toEqual(ages.toSorted((a, b) => a - b));
    expect((await request('/generate?fields=a:person.firstName&max=7')).body.metadata.total).toBe(7);
  });

  it('explains what is wrong with a bad request', async () => {
    const missing = await request<{ error: string }>('/generate');
    expect(missing.status).toBe(400);
    expect(missing.body.error).toMatch(/fields/);
    const unknown = await request<{ error: string }>('/generate?fields=x:unknown.method');
    expect(unknown.status).toBe(400);
    expect(unknown.body.error).toMatch(/Unknown generator type "unknown.method"/);
  });
});

describe('POST /generate', () => {
  it('accepts fields as an object or a list, with count and seed in the body', async () => {
    const a = await postJson('/generate?limit=5', { fields: { price: 'commerce.price' }, count: 50, seed: 3 });
    const b = await postJson('/generate?limit=5', {
      fields: [{ name: 'price', type: 'commerce.price' }],
      count: 50,
      seed: 3,
    });
    expect(a.status).toBe(200);
    expect(a.body.metadata.total).toBe(50);
    expect(a.body.results).toEqual(b.body.results);
  });

  it('matches GET for the same schema and seed', async () => {
    const get = await request('/generate?fields=name:person.fullName&seed=11&limit=5');
    const post = await postJson('/generate?limit=5', { fields: { name: 'person.fullName' }, seed: 11 });
    expect(post.body.results).toEqual(get.body.results);
  });

  it('rejects invalid bodies with 400', async () => {
    for (const body of [
      {},
      { fields: 'x' },
      { fields: { a: 'nope.nope' } },
      { fields: { a: 'person.firstName' }, count: 0 },
    ]) {
      const { status, body: error } = await postJson<{ error: string }>('/generate', body);
      expect(status).toBe(400);
      expect(error.error).toBeTruthy();
    }
  });
});
