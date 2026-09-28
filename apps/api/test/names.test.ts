import { describe, expect, it } from 'vitest';
import { app } from '../src/app.ts';
import { generatePeople } from '../src/data/names.ts';

interface Envelope {
  metadata: { count: number; total: number; output: { results: string }; parameters: Record<string, unknown> };
  results: Array<{ index: number; name: string; age: number }>;
}

const get = async <T = Envelope>(path: string) => {
  const res = await app.request(path);
  return { status: res.status, body: (await res.json()) as T };
};

describe('/names', () => {
  it('returns the first 10 people with metadata by default', async () => {
    const { status, body } = await get('/names');
    expect(status).toBe(200);
    expect(body.results).toHaveLength(10);
    expect(body.results[0]?.index).toBe(0);
    expect(body.metadata).toMatchObject({ count: 10, total: 1000, output: { results: 'results' } });
  });

  it('is served under the legacy /random-names path too', async () => {
    const [a, b] = await Promise.all([get('/names?limit=3'), get('/random-names?limit=3')]);
    expect(b.body.results).toEqual(a.body.results);
  });

  it('pages with offset and limit, including their aliases', async () => {
    const { body } = await get('/names?offset=5&limit=5');
    expect(body.results.map((p) => p.index)).toEqual([5, 6, 7, 8, 9]);
    const { body: aliased } = await get('/names?offset=5&size=5');
    expect(aliased.results).toEqual(body.results);
  });

  it('caps the dataset with max so clients can reach the end of the data', async () => {
    const { body } = await get('/names?max=25&offset=20&limit=10');
    expect(body.results.map((p) => p.index)).toEqual([20, 21, 22, 23, 24]);
    expect(body.metadata.total).toBe(25);
  });

  it('sorts numerically when asked', async () => {
    const { body } = await get('/names?limit=1000&sortBy=age:numeric');
    const ages = body.results.map((p) => p.age);
    expect(ages).toEqual(ages.toSorted((a, b) => a - b));
  });

  it('sorts by string descending', async () => {
    const { body } = await get('/names?limit=1000&sortBy=name&sortDirection=desc');
    const names = body.results.map((p) => p.name);
    expect(names).toEqual(names.toSorted((a, b) => b.localeCompare(a)));
  });

  it('reverses the dataset without a sort field', async () => {
    const { body } = await get('/names?limit=2&sortDirection=reverse');
    expect(body.results.map((p) => p.index)).toEqual([999, 998]);
  });

  it('drops the envelope when metadata is off', async () => {
    for (const flag of ['0', 'false']) {
      const { body } = await get<unknown[]>(`/names?limit=3&metadata=${flag}`);
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(3);
    }
  });

  it('renames the results key', async () => {
    const { body } = await get<Record<string, unknown>>('/names?limit=2&resultsName=rows');
    expect(body.rows).toHaveLength(2);
    expect(body.results).toBeUndefined();
  });

  it('falls back to defaults for invalid numbers', async () => {
    const { status, body } = await get('/names?limit=abc&offset=-4');
    expect(status).toBe(200);
    expect(body.results).toHaveLength(10);
    expect(body.results[0]?.index).toBe(0);
  });
});

describe('generatePeople', () => {
  it('produces identical data for the same seed', () => {
    expect(generatePeople(20, 42)).toEqual(generatePeople(20, 42));
    expect(generatePeople(20, 42)).not.toEqual(generatePeople(20, 43));
  });
});
