import { describe, expect, it } from 'vitest';
import { DEFAULT_MESSY_SHARE, messyRecord, messyRecords, parseMessy } from '../src/lib/messy.ts';
import { type Envelope, request } from './helpers.ts';

type Row = Record<string, unknown>;

const rows = async (path: string) => (await request<Row[]>(`${path}&metadata=false&limit=1000`)).body;

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

describe('parseMessy', () => {
  it('reads flags and shares', () => {
    expect(parseMessy(undefined)).toBe(0);
    expect(parseMessy('')).toBe(0);
    expect(parseMessy('true')).toBe(DEFAULT_MESSY_SHARE);
    expect(parseMessy('yes')).toBe(DEFAULT_MESSY_SHARE);
    expect(parseMessy('false')).toBe(0);
    expect(parseMessy('off')).toBe(0);
    expect(parseMessy('0')).toBe(0);
    expect(parseMessy('0.5')).toBe(0.5);
    expect(parseMessy('1')).toBe(1);
    expect(parseMessy('7')).toBe(1);
    expect(parseMessy('-1')).toBe(0);
  });
});

describe('messyRecord', () => {
  const record = { id: 1, name: 'Ada Lovelace', age: 36, price: 9.99, active: true, at: '2024-05-05T21:23:28.277Z' };

  it('leaves records alone at a share of 0 and keeps the fields it is told to keep', () => {
    expect(messyRecord(record, 0, { share: 0, seed: 1 })).toBe(record);
    for (let index = 0; index < 50; index++) {
      expect(messyRecord(record, index, { share: 1, seed: 1, keep: ['id'] }).id).toBe(1);
    }
  });

  it('keeps every change a smaller share made', () => {
    const records = Array.from({ length: 200 }, (_, id) => ({ ...record, id }));
    const small = messyRecords(records, { share: 0.15, seed: 4 });
    const large = messyRecords(records, { share: 0.5, seed: 4 });
    let changes = 0;
    small.forEach((messy, index) => {
      for (const [field, value] of Object.entries(records[index] as Row)) {
        const changed = !Object.is((messy as Row)[field], value) || !(field in messy);
        if (!changed) continue;
        changes++;
        expect(field in (large[index] as Row)).toBe(field in messy);
        expect((large[index] as Row)[field]).toEqual((messy as Row)[field]);
      }
    });
    expect(changes).toBeGreaterThan(100);
  });
});

describe('messy collections', () => {
  it('returns the same rows for the same seed, and others for another seed', async () => {
    const first = await rows('/users?messy=true&seed=1');
    expect(await rows('/users?messy=true&seed=1')).toEqual(first);
    expect(await rows('/users?messy=true&seed=2')).not.toEqual(first);
    expect(await rows('/users?messy=yes')).toEqual(first);
    expect(await rows('/users?messy=0.15')).toEqual(first);
  });

  it('changes nothing when off', async () => {
    const clean = await rows('/users?seed=3');
    expect(await rows('/users?seed=3&messy=false')).toEqual(clean);
    expect(await rows('/users?seed=3&messy=0')).toEqual(clean);
    expect(await rows('/users?seed=3&messy=true')).not.toEqual(clean);
  });

  it('rewrites about the share asked for, never the id', async () => {
    for (const [share, path] of [
      [0.15, '/users?messy=true'],
      [0.5, '/users?messy=0.5'],
    ] as const) {
      const clean = await rows('/users?seed=1');
      const messy = await rows(`${path}&seed=1`);
      let changed = 0;
      let total = 0;
      clean.forEach((row, index) => {
        const other = messy[index] as Row;
        expect(other.id).toBe(row.id);
        for (const [field, value] of Object.entries(row)) {
          if (field === 'id') continue;
          total++;
          if (!(field in other) || !Object.is(other[field], value)) changed++;
        }
      });
      expect(changed / total).toBeGreaterThan(share - 0.03);
      expect(changed / total).toBeLessThan(share + 0.03);
    }
  });

  it('keeps every value its type', async () => {
    for (const dataset of ['names', 'users', 'products', 'companies']) {
      const clean = await rows(`/${dataset}?seed=5`);
      const messy = await rows(`/${dataset}?seed=5&messy=1`);
      clean.forEach((row, index) => {
        const other = messy[index] as Row;
        for (const [field, value] of Object.entries(row)) {
          if (!(field in other) || other[field] === null) continue;
          const actual = other[field];
          expect(typeof actual, `${dataset}.${field}`).toBe(typeof value);
          if (Number.isInteger(value)) expect(Number.isInteger(actual), `${dataset}.${field}`).toBe(true);
          if (typeof value === 'string' && ISO.test(value)) expect(actual).toMatch(ISO);
        }
      });
    }
  });

  it('produces every kind of ugliness', async () => {
    const values = [
      ...(await rows('/users?messy=0.5')),
      ...(await rows('/products?messy=0.5')),
      ...(await rows('/generate?fields=name:person.fullName,day:date.past,birthday:date.birthdate&messy=0.5')),
    ].flatMap((row) => Object.values(row));
    const strings = values.filter((v): v is string => typeof v === 'string');
    const numbers = values.filter((v): v is number => typeof v === 'number');
    const missing = (await rows('/users?messy=0.5')).some((row) => Object.keys(row).length < 15);

    const kinds: Record<string, boolean> = {
      null: values.includes(null),
      'missing key': missing,
      empty: strings.includes(''),
      'whitespace only': strings.some((s) => s.length > 0 && s.trim() === ''),
      '120 characters': strings.some((s) => s.length === 120),
      '2,000 characters': strings.some((s) => s.length === 2000),
      emoji: strings.some((s) => /\p{Extended_Pictographic}/u.test(s)),
      'combining mark': strings.some((s) => /\p{M}/u.test(s)),
      'zero-width joiner': strings.some((s) => s.includes('‍')),
      'right to left': strings.some((s) => /[֐-ࣿ]/.test(s)),
      'leading or trailing whitespace': strings.some((s) => s.trim() !== '' && s !== s.trim() && s.length < 120),
      zero: numbers.includes(0),
      negative: numbers.some((n) => n < 0),
      'very large': numbers.some((n) => n >= 2147483647),
      'many decimals': numbers.some((n) => (String(n).split('.')[1]?.length ?? 0) > 6),
      epoch: strings.includes('1970-01-01T00:00:00.000Z'),
      'far future': strings.includes('9999-12-31T23:59:59.999Z'),
      '29 February': strings.some((s) => /^\d{4}-02-29T/.test(s)),
    };
    expect(Object.entries(kinds).filter(([, seen]) => !seen)).toEqual([]);
  });

  it('works on countries, which have no seed, and on /generate', async () => {
    const countries = await request<Row[]>('/countries?messy=1');
    expect(countries.status).toBe(200);
    expect(countries.body.every((row) => typeof row.alpha2 === 'string')).toBe(true);
    expect(countries.body).toEqual((await request<Row[]>('/countries?messy=1')).body);

    const path = '/generate?fields=name:person.fullName,joined:date.past&messy=1&limit=50';
    const generated = await request<Envelope>(path);
    expect(generated.body.results.map((row) => row.index)).toEqual(Array.from({ length: 50 }, (_, i) => i));
    expect(generated.body.results).toEqual((await request<Envelope>(path)).body.results);
    expect(generated.body.metadata.parameters.messy).toBe(1);
  });

  it('gives an item the same rewrite as its row in the list', async () => {
    const list = await rows('/users?messy=0.5&seed=8');
    for (const id of [1, 2, 3, 500, 1000]) {
      const { body } = await request<Row>(`/users/${id}?messy=0.5&seed=8`);
      expect(body).toEqual(list[id - 1]);
    }
    const { body } = await request<Row>('/names/10?messy=0.5&seed=8');
    expect(body).toEqual((await rows('/names?messy=0.5&seed=8'))[10]);
  });

  it('is never a field filter, and filters still find fields a messy first record lost', async () => {
    const { body } = await request<Envelope>('/names?messy=true');
    expect(body.metadata.total).toBe(1000);
    expect(body.metadata.parameters.messy).toBe(DEFAULT_MESSY_SHARE);
    expect((await request<Envelope>('/names')).body.metadata.parameters.messy).toBeNull();

    // Find a seed whose first record lost a key, then filter on that key.
    const fields = Object.keys((await rows('/users?seed=1'))[0] ?? {});
    for (let seed = 1; seed <= 50; seed++) {
      const [first] = (await request<Row[]>(`/users?seed=${seed}&messy=1&limit=1&metadata=false`)).body;
      const lost = fields.find((field) => !(field in (first ?? {})));
      if (!lost) continue;
      expect(await rows(`/users?seed=${seed}&messy=1&${lost}=zzz-none`)).toEqual([]);
      return;
    }
    throw new Error('No seed in 1 to 50 drops a key from the first user.');
  });

  it('is part of the cursor fingerprint', async () => {
    const first = await request<Envelope>('/users?messy=true&cursor=&limit=5');
    const cursor = first.body.metadata.nextCursor as string;
    const next = await request<Envelope>(`/users?messy=true&limit=5&cursor=${cursor}`);
    expect(next.status).toBe(200);
    expect(next.body.results[0]?.id).toBe(6);
    const refused = await request<{ error: string }>(`/users?limit=5&cursor=${cursor}`);
    expect(refused.status).toBe(400);
    expect(refused.body.error).toMatch(/messy/);
  });

  it('serialises in every format', async () => {
    for (const format of ['csv', 'yaml', 'xml']) {
      const { status, text } = await request(`/users?messy=1&limit=100&format=${format}`);
      expect(status, format).toBe(200);
      expect(text.length, format).toBeGreaterThan(0);
    }
  });

  it('is documented in the OpenAPI document with the nullability note', async () => {
    const { body } = await request<{
      paths: Record<string, { get: { parameters: Array<{ name: string; description: string }> } }>;
    }>('/openapi.json');
    for (const path of ['/names', '/users/{id}', '/generate']) {
      const messy = body.paths[path]?.get.parameters.find((parameter) => parameter.name === 'messy');
      expect(messy?.description, path).toMatch(/null or\s+missing/);
    }
  });
});
