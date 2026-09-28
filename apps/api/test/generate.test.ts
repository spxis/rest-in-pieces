import { describe, expect, it } from 'vitest';
import { app } from '../src/app.ts';

const get = async <T = unknown>(path: string) => {
  const response = await app.request(path);
  return { status: response.status, body: (await response.json()) as T };
};

describe('/generate', () => {
  it('generates repeatable custom records from the requested field types', async () => {
    const path = '/generate?fields=name:person.fullName,email:internet.email&limit=3&seed=42';
    const [first, repeated] = await Promise.all([
      get<Array<{ name: string; email: string }>>(path),
      get<Array<{ name: string; email: string }>>(path),
    ]);
    expect(first.status).toBe(200);
    expect(first.body).toEqual(repeated.body);
    expect(first.body).toHaveLength(3);
    expect(first.body[0]).toHaveProperty('name');
    expect(first.body[0]).toHaveProperty('email');
  });

  it('supports pagination and sorting', async () => {
    const { body } = await get<Array<{ age: number }>>(
      '/generate?fields=age:number.int&limit=3&offset=2&sortBy=age:numeric',
    );
    expect(body).toHaveLength(3);
    expect(body.map((record) => record.age)).toEqual(body.map((record) => record.age).toSorted((a, b) => a - b));
  });

  it('rejects missing fields and unknown generator types', async () => {
    expect((await get('/generate')).status).toBe(400);
    expect((await get('/generate?fields=x:unknown.method')).status).toBe(400);
  });
});

describe('/generators', () => {
  it('lists the supported generator types', async () => {
    const { status, body } = await get<{ generators: string[] }>('/generators');
    expect(status).toBe(200);
    expect(body.generators).toContain('person.fullName');
    expect(body.generators).toContain('internet.email');
  });
});
