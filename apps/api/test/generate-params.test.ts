import { describe, expect, it } from 'vitest';
import {
  compileField,
  FieldError,
  generateRecords,
  generatorParameters,
  parseFieldList,
  SchemaError,
  splitFields,
} from '../src/data/generators.ts';
import { postJson, request } from './helpers.ts';

type Fields = Record<string, unknown>;
type Failure = { error: string; field?: string };

/** A sample argument list for every type that takes one. */
const SAMPLES: Record<string, string> = {
  'number.int': '18,65',
  'number.float': '1,2,3',
  'commerce.price': '5,500,2',
  'finance.amount': '-10,10',
  'date.past': '2',
  'date.future': '2',
  'date.recent': '30',
  'date.soon': '30',
  'date.between': '2020-01-01,2025-12-31',
  'date.birthdate': '18,30',
  'string.alpha': '5',
  'string.alphanumeric': '6',
  'string.numeric': '7',
  'string.hexadecimal': '8',
  'string.sample': '9',
  'lorem.words': '3',
  'lorem.sentence': '4',
  'lorem.sentences': '2',
  'lorem.paragraph': '2',
  'lorem.paragraphs': '2',
  'lorem.lines': '2',
  'word.words': '3',
  'internet.password': '12',
  'person.firstName': 'female',
  'person.lastName': 'male',
  'person.fullName': 'female',
  'location.latitude': '40,50,3',
  'location.longitude': '-80,-70',
  'finance.creditCardNumber': 'visa',
  'image.url': '320,200',
};

const generate = (fields: string, rest = '') =>
  request<Fields[] & Failure>(`/generate?fields=${encodeURIComponent(fields)}&metadata=false&limit=50&seed=5${rest}`);

describe('/generate arguments', () => {
  it('has a sample for every type that takes arguments, and every one makes values', () => {
    const typed = Object.keys(generatorParameters).filter((type) => type !== 'pick');
    expect(Object.keys(SAMPLES).sort()).toEqual(typed.sort());
    const fields = typed.map((type, i) => ({ name: `f${i}`, type: `${type}(${SAMPLES[type]})` }));
    for (const record of generateRecords(fields, 20, 1)) {
      for (const field of fields) expect(record[field.name], field.type).not.toBeUndefined();
    }
  });

  it('passes them on: ranges, lengths, counts and sexes', async () => {
    const { status, body } = await generate(
      'age:number.int(18,65),price:commerce.price(5,500,2),code:string.alpha(5),words:lorem.words(3),joined:date.between(2020-01-01,2020-12-31),lat:location.latitude(40,50,3)',
    );
    expect(status).toBe(200);
    for (const record of body) {
      expect(record.age).toBeGreaterThanOrEqual(18);
      expect(record.age).toBeLessThanOrEqual(65);
      expect(Number(record.price)).toBeGreaterThanOrEqual(5);
      expect(Number(record.price)).toBeLessThanOrEqual(500);
      expect(String(record.code)).toMatch(/^[A-Za-z]{5}$/);
      expect(String(record.words).split(' ')).toHaveLength(3);
      expect(String(record.joined).slice(0, 4)).toBe('2020');
      expect(Number(record.lat)).toBeGreaterThanOrEqual(40);
    }
  });

  it('answers 422 naming the field, for every way an argument can be wrong', async () => {
    const cases: Array<[string, RegExp]> = [
      ['a:number.int(1)', /takes \(min, max\); got 1 argument\b/],
      ['a:number.int(1,2,3)', /got 3 arguments/],
      ['a:number.int(x,2)', /min must be a whole number; got "x"/],
      ['a:number.int(1.5,2)', /whole number/],
      ['a:number.float(1,y)', /max must be a number/],
      ['a:number.int(65,18)', /must not be greater than the second/],
      ['a:string.alpha(0)', /length must be from 1 to 256/],
      ['a:string.alpha(1000)', /from 1 to 256/],
      ['a:date.between(2025-01-01,2020-01-01)', /from must not be after to/],
      ['a:date.between(yesterday,2020-01-01)', /must be a date/],
      ['a:person.firstName(robot)', /sex must be one of male, female/],
      ['a:finance.creditCardNumber(bank)', /issuer must be one of visa/],
      ['a:person.jobTitle(3)', /takes no arguments. These do:/],
      ['a:number.int()', /takes \(min, max\); got 0 arguments/],
    ];
    for (const [fields, message] of cases) {
      const { status, body } = await generate(fields);
      expect(status, fields).toBe(422);
      expect(body.error, fields).toMatch(message);
      expect(body.field).toBe('a');
    }
  });
});

describe('pick', () => {
  it('chooses evenly, or by weight, and leaves out choices weighted 0', async () => {
    const even = (await request<Fields[]>(`/generate?fields=s:pick(a,b,c)&metadata=false&limit=1000`)).body;
    const counts = (rows: Fields[]) => {
      const tally: Record<string, number> = {};
      for (const row of rows) tally[String(row.s)] = (tally[String(row.s)] ?? 0) + 1;
      return tally;
    };
    expect(Object.keys(counts(even)).sort()).toEqual(['a', 'b', 'c']);
    const weighted = counts(
      (await request<Fields[]>(`/generate?fields=s:pick(active,paused,closed|70,20,10)&metadata=false&limit=1000`))
        .body,
    );
    expect(weighted.active).toBeGreaterThan(600);
    expect(weighted.closed).toBeLessThan(160);
    const never = counts((await request<Fields[]>(`/generate?fields=s:pick(x,y|1,0)&metadata=false&limit=200`)).body);
    expect(never).toEqual({ x: 200 });
  });

  it('answers 422 for empty, long, unweighted or extra choices', async () => {
    const cases: Array<[string, RegExp]> = [
      ['s:pick', /pick needs choices/],
      ['s:pick()', /pick needs choices/],
      ['s:pick(a,,b)', /empty choice/],
      [`s:pick(${'x'.repeat(65)})`, /longer than 64/],
      [`s:pick(${Array.from({ length: 51 }, (_, i) => `c${i}`).join(',')})`, /at most 50 choices/],
      ['s:pick(a,b|1)', /2 choices and 1 weights/],
      ['s:pick(a,b|1,-1)', /0 or more/],
      ['s:pick(a,b|0,0)', /not all 0/],
      ['s:pick(a,b|1,x)', /0 or more/],
      ['s:pick(a|1|2)', /one "\|"/],
    ];
    for (const [fields, message] of cases) {
      const { status, body } = await generate(fields);
      expect(status, fields).toBe(422);
      expect(body.error, fields).toMatch(message);
    }
  });
});

describe('blank', () => {
  it('leaves about that share of values null, with or without a % sign', async () => {
    for (const rate of ['15', '15%', '15.0']) {
      const rows = (
        await request<Fields[]>(
          `/generate?fields=${encodeURIComponent(`n:person.firstName?blank=${rate}`)}&metadata=false&limit=1000`,
        )
      ).body;
      const blanks = rows.filter((r) => r.n === null).length;
      expect(blanks, rate).toBeGreaterThan(100);
      expect(blanks, rate).toBeLessThan(200);
    }
    const all = (await generate('n:pick(a,b)?blank=100')).body;
    expect(all.every((r) => r.n === null)).toBe(true);
    const none = (await generate('n:number.int(1,3)?blank=0')).body;
    expect(none.every((r) => typeof r.n === 'number')).toBe(true);
  });

  it('answers 422 for a rate that is not a percentage', async () => {
    for (const rate of ['', 'some', '101', '-5', '15%%']) {
      const { status, body } = await generate(`n:person.firstName?blank=${rate}`);
      expect(status, rate).toBe(422);
      expect(body.error).toContain('blank must be a percentage');
    }
  });
});

describe('field lists with the new syntax', () => {
  it('split on commas outside parentheses only', () => {
    expect(splitFields('a:pick(x,y),b:number.int(1,9),c:x')).toEqual(['a:pick(x,y)', 'b:number.int(1,9)', 'c:x']);
    expect(parseFieldList('a:pick(x,y|1,2)?blank=10, b:number.int(1,9)')).toEqual([
      { name: 'a', type: 'pick(x,y|1,2)?blank=10' },
      { name: 'b', type: 'number.int(1,9)' },
    ]);
    for (const bad of ['a:b:c', 'a:number.int(1,2):x', ':x', 'a:'])
      expect(() => parseFieldList(bad), bad).toThrow(SchemaError);
    expect(() => compileField({ name: 'x', type: 'nope.nope(1)' })).toThrow(SchemaError);
    expect(() => compileField({ name: 'x', type: 'number.int(1' })).toThrow(SchemaError);
    expect(() => compileField({ name: 'x', type: 'number.int(1,2,3)' })).toThrow(FieldError);
  });

  it('work in POST bodies, and the same seed gives the same records', async () => {
    const body = {
      fields: { age: 'number.int(18,65)', status: 'pick(a,b|9,1)', note: 'lorem.words(2)?blank=50' },
      seed: 3,
      count: 20,
    };
    const first = await postJson<{ results: Fields[] }>('/generate?limit=20', body);
    expect(first.status).toBe(200);
    expect((await postJson<{ results: Fields[] }>('/generate?limit=20', body)).body.results).toEqual(
      first.body.results,
    );
    const bad = await postJson<Failure>('/generate', { fields: { age: 'number.int(9,1)' } });
    expect(bad.status).toBe(422);
    expect(bad.body.field).toBe('age');
  });

  it('are listed under parameters in /generators and described in the OpenAPI document', async () => {
    const { body } = await request<{ parameters: Record<string, string> }>('/generators');
    expect(body.parameters['number.int']).toBe('min, max');
    expect(body.parameters['number.float']).toBe('min, max, fractionDigits?');
    expect(body.parameters.pick).toContain('weight');
    const doc = (
      await request<{ paths: Record<string, Record<string, { description: string; responses: Fields }>> }>(
        '/openapi.json',
      )
    ).body;
    expect(doc.paths['/generate']?.get?.description).toContain('?blank=15');
    expect(doc.paths['/generate']?.get?.responses).toHaveProperty('422');
  });
});
