import { describe, expect, it } from 'vitest';
import { generateRecords, parseConstraint, parseFieldList, splitFields } from '../src/data/generators.ts';
import { type Envelope, postJson, request } from './helpers.ts';

const enc = encodeURIComponent;

const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
const sd = (values: number[]) => Math.sqrt(mean(values.map((v) => (v - mean(values)) ** 2)));

describe('derived fields', () => {
  const fields = [
    { name: 'born', type: 'date.birthdate(18,65)' },
    { name: 'age', type: '=age(born)' },
    { name: 'first', type: 'person.firstName' },
    { name: 'last', type: 'person.lastName' },
    { name: 'full', type: "=concat(first, ' ', last)" },
    { name: 'adult', type: '=age >= 18' },
  ];

  it('works out an age from the birth date it sits beside', () => {
    const records = generateRecords(fields, 200, 7);
    for (const record of records) {
      const born = record.born as Date;
      const now = new Date();
      now.setUTCHours(0, 0, 0, 0);
      let years = now.getUTCFullYear() - born.getUTCFullYear();
      if (
        now.getUTCMonth() < born.getUTCMonth() ||
        (now.getUTCMonth() === born.getUTCMonth() && now.getUTCDate() < born.getUTCDate())
      )
        years--;
      expect(record.age).toBe(years);
      expect(record.age as number).toBeGreaterThanOrEqual(17);
      expect(record.full).toBe(`${record.first} ${record.last}`);
      expect(record.adult).toBe(true);
    }
  });

  it('keeps the order the fields were written in, and every other field as it was', () => {
    const withoutDerived = generateRecords(
      fields.filter((f) => !f.type.startsWith('=')),
      20,
      7,
    );
    const withDerived = generateRecords(fields, 20, 7);
    expect(Object.keys(withDerived[0] ?? {})).toEqual(['index', 'born', 'age', 'first', 'last', 'full', 'adult']);
    for (const [i, plain] of withoutDerived.entries()) {
      for (const [key, value] of Object.entries(plain)) expect(withDerived[i]?.[key]).toEqual(value);
    }
  });

  it('is repeatable for a seed, and different for another', () => {
    const a = generateRecords(fields, 10, 1);
    expect(generateRecords(fields, 10, 1)).toEqual(a);
    expect(generateRecords(fields, 10, 2)).not.toEqual(a);
  });

  it('works out derived fields from derived fields in any order', () => {
    const records = generateRecords(
      [
        { name: 'c', type: '=b * 2' },
        { name: 'b', type: '=a + 1' },
        { name: 'a', type: 'number.int(1,5)' },
      ],
      30,
      3,
    );
    for (const r of records) {
      expect(r.b).toBe((r.a as number) + 1);
      expect(r.c).toBe((r.b as number) * 2);
    }
  });

  it('reads index, and leaves a blank source blank', () => {
    const records = generateRecords(
      [
        { name: 'n', type: 'number.int(1,9)?blank=100' },
        { name: 'twice', type: '=n * 2' },
        { name: 'id', type: "=concat('REC-', pad(index + 1, 4))" },
      ],
      3,
      1,
    );
    expect(records.map((r) => [r.n, r.twice, r.id])).toEqual([
      [null, null, 'REC-0001'],
      [null, null, 'REC-0002'],
      [null, null, 'REC-0003'],
    ]);
  });

  it('refuses what it cannot read, with the field named', async () => {
    const bad: [string, RegExp][] = [
      ['a:=b', /Field "a".*"b" is not a field/],
      ['a:=a + 1', /Field "a".*reads the field it defines/],
      ['a:=1 +', /Field "a"/],
      ['a:=nope(1)', /not a function/],
      ['a:=age()', /takes 1 to 2/],
      ['a:=1 = 1', /single "="/],
    ];
    for (const [list, message] of bad) {
      const { status, body } = await request<{ error: string }>(`/generate?fields=${enc(list)}`);
      expect(status, list).toBe(400);
      expect(body.error).toMatch(message);
    }
    const loop = await request<{ error: string }>(`/generate?fields=${enc('a:=b,b:=c,c:=a')}`);
    expect(loop.status).toBe(400);
    expect(loop.body.error).toMatch(/depend on each other/);
  });

  it('allows at most ten derived fields and holds each to the expression limits', async () => {
    const many = Array.from({ length: 11 }, (_, i) => `d${i}:=1`).join(',');
    expect((await request(`/generate?fields=${enc(many)}`)).status).toBe(400);
    const ten = Array.from({ length: 10 }, (_, i) => `d${i}:=1`).join(',');
    expect((await request(`/generate?fields=${enc(ten)}&limit=1`)).status).toBe(200);
    const long = `x:=${'1+'.repeat(100)}1`;
    expect((await request(`/generate?fields=${enc(long)}`)).status).toBe(400);
  });

  it('reads quotes, colons and commas inside an expression in the compact form', () => {
    expect(splitFields("a:=concat('x,y', ')'),b:number.int(1,2)")).toEqual([
      "a:=concat('x,y', ')')",
      'b:number.int(1,2)',
    ]);
    const parsed = parseFieldList("a:=1 > 0 ? 'on:off' : 'no', b:pick(it's,it,did)");
    expect(parsed).toEqual([
      { name: 'a', type: "=1 > 0 ? 'on:off' : 'no'" },
      { name: 'b', type: "pick(it's,it,did)" },
    ]);
  });

  it('serves them from GET, POST, in every format and with safe values', async () => {
    const get = await request<Envelope>(
      `/generate?fields=${enc("n:number.int(1,5),sq:=n * n,mail:=concat('a@', 'real.org')")}&limit=5&seed=2&safe=true`,
    );
    expect(get.status).toBe(200);
    for (const r of get.body.results) {
      expect(r.sq).toBe((r.n as number) ** 2);
      expect(r.mail).toMatch(/^a@example\.(com|org|net)$/);
    }
    const post = await postJson<Envelope>('/generate?limit=3', {
      fields: { n: 'number.int(1,5)', sq: '=n * n' },
      seed: 1,
    });
    expect(post.body.results.map((r) => r.sq)).toEqual(post.body.results.map((r) => (r.n as number) ** 2));
    const csv = await request(`/generate?fields=${enc('n:number.int(1,5),sq:=n * n')}&limit=2&format=csv`);
    expect(csv.text).toContain('index,n,sq');
    const sql = await request(
      `/generate?fields=${enc('born:date.between(2000-01-01,2000-01-02),y:=year(born)')}&limit=1&format=sql`,
    );
    expect(sql.text).toMatch(
      /^INSERT INTO "generated" \("index", "born", "y"\) VALUES \(0, '2000-01-0[12]T[^']*', 2000\);$/m,
    );
    const array = await postJson('/generate', { fields: [{ name: 'a', type: '=1 +' }] });
    expect(array.status).toBe(400);
  });
});

describe('constraints', () => {
  const range = [
    { name: 'start', type: 'date.between(2026-01-01,2026-12-31)' },
    { name: 'end', type: 'date.between(2026-01-01,2026-12-31)' },
  ];

  it('puts two dates in order without drawing again', () => {
    const records = generateRecords(range, 300, 5, undefined, undefined, ['end>start']);
    const free = generateRecords(range, 300, 5);
    let swapped = 0;
    for (const [i, r] of records.entries()) {
      expect((r.end as Date).getTime()).toBeGreaterThanOrEqual((r.start as Date).getTime());
      const f = free[i] as Record<string, Date>;
      expect(new Set([r.start, r.end].map((d) => (d as Date).getTime()))).toEqual(
        new Set([f.start?.getTime(), f.end?.getTime()]),
      );
      if ((f.end as Date) < (f.start as Date)) swapped++;
    }
    expect(swapped).toBeGreaterThan(50);
  });

  it('moves the later value on when a strict constraint finds them equal', () => {
    const same = [
      { name: 'a', type: 'number.int(5,5)' },
      { name: 'b', type: 'number.int(5,5)' },
      { name: 'd1', type: 'date.between(2026-01-01,2026-01-01)' },
      { name: 'd2', type: 'date.between(2026-01-01,2026-01-01)' },
    ];
    const [strict] = generateRecords(same, 1, 1, undefined, undefined, ['b>a', 'd2 after d1']);
    expect(strict?.b).toBe(6);
    expect(((strict as Record<string, unknown>).d2 as Date).toISOString()).toBe('2026-01-02T00:00:00.000Z');
    const [loose] = generateRecords(same, 1, 1, undefined, undefined, ['b>=a']);
    expect(loose?.b).toBe(5);
  });

  it('settles a chain', () => {
    const chain = ['a', 'b', 'c', 'd'].map((name) => ({ name, type: 'number.int(1,1000)' }));
    for (const r of generateRecords(chain, 200, 9, undefined, undefined, ['a<b', 'b<c', 'c<d'])) {
      expect(r.a as number).toBeLessThan(r.b as number);
      expect(r.b as number).toBeLessThan(r.c as number);
      expect(r.c as number).toBeLessThan(r.d as number);
    }
  });

  it('leaves blanks and different kinds alone', () => {
    const records = generateRecords(
      [
        { name: 'a', type: 'number.int(1,9)?blank=100' },
        { name: 'b', type: 'number.int(1,9)' },
        { name: 's', type: 'lorem.word' },
      ],
      5,
      1,
      undefined,
      undefined,
      ['b>a', 'b>s'],
    );
    for (const r of records) expect(r.a).toBeNull();
  });

  it('reads the ways of writing one', () => {
    expect(parseConstraint('end > start')).toEqual({ later: 'end', earlier: 'start', strict: true });
    expect(parseConstraint('start<end')).toEqual({ later: 'end', earlier: 'start', strict: true });
    expect(parseConstraint('total>=subtotal')).toEqual({ later: 'total', earlier: 'subtotal', strict: false });
    expect(parseConstraint('a <= b')).toEqual({ later: 'b', earlier: 'a', strict: false });
    expect(parseConstraint('end after start')).toEqual({ later: 'end', earlier: 'start', strict: true });
    expect(parseConstraint('start before end')).toEqual({ later: 'end', earlier: 'start', strict: true });
  });

  it('refuses constraints it cannot keep', async () => {
    const q = (constraints: string) =>
      request<{ error: string }>(
        `/generate?fields=${enc('a:number.int,b:number.int,c:=a+1')}&constraints=${enc(constraints)}`,
      );
    expect((await q('a>b')).status).toBe(200);
    for (const [constraints, message] of [
      ['a', /should look like/],
      ['a>z', /not a field/],
      ['a>a', /with itself/],
      ['c>a', /derived field/],
      ['a>b,b>a', /contradict/],
      ['a>b,b>c2', /not a field/],
      ['a == b', /should look like/],
    ] as const) {
      const { status, body } = await q(constraints);
      expect(status, constraints).toBe(400);
      expect(body.error).toMatch(message);
    }
    const eleven = Array.from({ length: 11 }, () => 'a>b').join(',');
    expect((await q(eleven)).status).toBe(400);
    const post = await postJson('/generate', {
      fields: { a: 'number.int', b: 'number.int' },
      constraints: Array.from({ length: 11 }, () => 'a>b'),
    });
    expect(post.status).toBe(400);
  });

  it('works on GET and POST and is part of a page cursor', async () => {
    const path = `/generate?fields=${enc('start:date.between(2026-01-01,2026-12-31),end:date.between(2026-01-01,2026-12-31)')}&constraints=end>start&limit=50&seed=4`;
    const get = await request<Envelope<{ start: string; end: string }>>(path);
    for (const r of get.body.results) expect(r.end >= r.start).toBe(true);
    const post = await postJson<Envelope<{ start: string; end: string }>>('/generate?limit=50', {
      fields: { start: 'date.between(2026-01-01,2026-12-31)', end: 'date.between(2026-01-01,2026-12-31)' },
      constraints: ['end > start'],
      seed: 4,
    });
    expect(post.body.results).toEqual(get.body.results);
    const next = get.body.metadata.nextCursor;
    expect((await request(`${path}&cursor=${next}`)).status).toBe(200);
    expect(
      (await request(`${path.replace('constraints=end>start', 'constraints=start>end')}&cursor=${next}`)).status,
    ).toBe(400);
  });
});

describe('distributions', () => {
  const column = (type: string, count = 1000, seed = 11) =>
    generateRecords([{ name: 'v', type }], count, seed).map((r) => r.v as number);

  it('normal gathers around its mean and spread', () => {
    const values = column('number.normal(100,15)');
    expect(mean(values)).toBeGreaterThan(97);
    expect(mean(values)).toBeLessThan(103);
    expect(sd(values)).toBeGreaterThan(13);
    expect(sd(values)).toBeLessThan(17);
    const inside = values.filter((v) => Math.abs(v - 100) <= 15).length / values.length;
    expect(inside).toBeGreaterThan(0.63);
    expect(inside).toBeLessThan(0.74);
  });

  it('normal stays inside its bounds and rounds to its places', () => {
    const values = column('number.normal(50,30,0,100,0)');
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
      expect(Number.isInteger(v)).toBe(true);
    }
    for (const v of column('number.normal(0,1,-5,5,3)', 100))
      expect(String(v).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(3);
  });

  it('lognormal is positive and skewed to the right', () => {
    const values = column('number.lognormal(1000,0.6)');
    expect(values.every((v) => v > 0)).toBe(true);
    expect(mean(values)).toBeGreaterThan([...values].sort((a, b) => a - b)[500] as number);
    const median = [...values].sort((a, b) => a - b)[500] as number;
    expect(median).toBeGreaterThan(850);
    expect(median).toBeLessThan(1150);
  });

  it('exponential has its mean, never below 0 or above its cap', () => {
    const values = column('number.exponential(5)');
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(mean(values)).toBeGreaterThan(4.4);
    expect(mean(values)).toBeLessThan(5.6);
    expect(Math.max(...column('number.exponential(5,8)'))).toBeLessThanOrEqual(8);
  });

  it('zipf makes rank 1 most common and ranks fall away', () => {
    const values = column('number.zipf(50,1)', 1000);
    const counts = new Map<number, number>();
    for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
    expect(Math.min(...values)).toBeGreaterThanOrEqual(1);
    expect(Math.max(...values)).toBeLessThanOrEqual(50);
    expect(values.every(Number.isInteger)).toBe(true);
    const first = counts.get(1) ?? 0;
    const second = counts.get(2) ?? 0;
    expect(first).toBeGreaterThan(second);
    expect(second).toBeGreaterThan(counts.get(10) ?? 0);
    expect(first / 1000).toBeGreaterThan(0.17);
    expect(first / 1000).toBeLessThan(0.28);
    expect(new Set(column('number.zipf(1)', 20))).toEqual(new Set([1]));
    const flat = column('number.zipf(10,0)', 2000);
    expect(flat.filter((v) => v === 1).length).toBeGreaterThan(130);
  });

  it('is repeatable for a seed', () => {
    expect(column('number.normal(0,1)', 20, 5)).toEqual(column('number.normal(0,1)', 20, 5));
  });

  it('refuses arguments it cannot use, naming the field', async () => {
    for (const type of [
      'number.normal(0)',
      'number.normal(0,-1)',
      'number.normal(0,1,5,1)',
      'number.normal(a,1)',
      'number.lognormal(0,1)',
      'number.lognormal(1,99)',
      'number.exponential(0)',
      'number.zipf(0)',
      'number.zipf(10001)',
      'number.zipf(10,9)',
      'number.zipf(1.5)',
    ]) {
      const res = await request<{ error: string; field: string }>(`/generate?fields=${enc(`v:${type}`)}`);
      expect(res.status, type).toBe(422);
      expect(res.body.field).toBe('v');
    }
    expect((await request(`/generate?fields=${enc('v:number.zipf')}`)).status).toBe(400);
  });

  it('is listed with its arguments', async () => {
    const { body } = await request<{
      parameters: Record<string, string>;
      functions: Record<string, string>;
      limits: Record<string, number>;
    }>('/generators');
    expect(body.parameters['number.normal']).toBe('mean, sd, min?, max?, dec?');
    expect(body.parameters['number.zipf']).toBe('n, s?');
    expect(body.functions.age).toBe('age(birthDate, asOf?)');
    expect(body.limits).toMatchObject({ source: 400, tokens: 150, depth: 12, nodes: 100, derived: 10 });
  });
});
