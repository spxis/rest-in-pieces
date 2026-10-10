import { afterEach, describe, expect, it, vi } from 'vitest';
import { SCHEMA_LIMITS } from '../src/lib/jsonschema.ts';
import { compilePattern, PATTERN_LIMITS, PatternError } from '../src/lib/pattern.ts';
import { type Envelope, postJson, request } from './helpers.ts';

// biome-ignore lint/suspicious/noExplicitAny: generated values are read by their schema's shape
type Json = any;

// ---- a small validator for the subset the generator supports, so the tests check the records, not the generator ----

const FORMATS: Record<string, RegExp> = {
  email: /^[^@\s]+@[^@\s]+\.[^@\s]+$/,
  uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  'date-time': /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/,
  date: /^\d{4}-\d{2}-\d{2}$/,
  time: /^\d{2}:\d{2}:\d{2}Z$/,
  uri: /^https?:\/\/[^\s]+$/,
  ipv4: /^\d{1,3}(\.\d{1,3}){3}$/,
  hostname: /^[a-z0-9.-]+$/i,
};

function pointer(root: Json, ref: string): Json {
  return ref
    .slice(2)
    .split('/')
    .reduce((at, part) => at[decodeURIComponent(part).replaceAll('~1', '/').replaceAll('~0', '~')], root);
}

function errors(schema: Json, value: Json, root: Json, path = ''): string[] {
  if (schema === true) return [];
  if (schema.$ref) return errors({ ...pointer(root, schema.$ref), ...omit(schema, '$ref') }, value, root, path);
  const out: string[] = [];
  const bad = (message: string) => out.push(`${path || '/'}: ${message}`);
  if (schema.allOf) for (const part of schema.allOf) out.push(...errors(part, value, root, path));
  if (schema.oneOf || schema.anyOf) {
    const branches = schema.oneOf ?? schema.anyOf;
    if (
      !branches.some(
        (branch: Json) =>
          errors({ ...omit(schema, 'oneOf', 'anyOf'), ...resolved(branch, root) }, value, root, path).length === 0,
      )
    ) {
      bad('matches no branch');
    }
  }
  if (value === null) {
    const types = [schema.type].flat().filter(Boolean);
    if (!(schema.nullable === true || types.length === 0 || types.includes('null'))) bad('null is not allowed');
    return out;
  }
  if (schema.const !== undefined && JSON.stringify(schema.const) !== JSON.stringify(value)) bad('not the const');
  if (schema.enum && !schema.enum.some((item: Json) => JSON.stringify(item) === JSON.stringify(value)))
    bad('not in the enum');
  const types = [schema.type].flat().filter(Boolean) as string[];
  const kind = Array.isArray(value) ? 'array' : typeof value;
  if (
    types.length &&
    !types.some(
      (type) =>
        type === kind || (type === 'integer' && Number.isInteger(value)) || (type === 'number' && kind === 'number'),
    )
  ) {
    bad(`${kind} is not ${types.join('/')}`);
  }
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) bad('too short');
    if (schema.maxLength !== undefined && value.length > schema.maxLength) bad('too long');
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) bad(`"${value}" does not match ${schema.pattern}`);
    if (schema.format && FORMATS[schema.format] && !FORMATS[schema.format]?.test(value))
      bad(`"${value}" is not a ${schema.format}`);
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) bad('below minimum');
    if (schema.maximum !== undefined && value > schema.maximum) bad('above maximum');
    if (typeof schema.exclusiveMinimum === 'number' && value <= schema.exclusiveMinimum)
      bad('not above exclusiveMinimum');
    if (typeof schema.exclusiveMaximum === 'number' && value >= schema.exclusiveMaximum)
      bad('not below exclusiveMaximum');
    if (schema.multipleOf && Math.abs(value / schema.multipleOf - Math.round(value / schema.multipleOf)) > 1e-6)
      bad('not a multiple');
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) bad('too few items');
    if (schema.maxItems !== undefined && value.length > schema.maxItems) bad('too many items');
    if (schema.uniqueItems && new Set(value.map((item) => JSON.stringify(item))).size !== value.length)
      bad('items repeat');
    const prefix = schema.prefixItems ?? (Array.isArray(schema.items) ? schema.items : []);
    value.forEach((item, i) => {
      const itemSchema = i < prefix.length ? prefix[i] : Array.isArray(schema.items) ? true : (schema.items ?? true);
      out.push(...errors(itemSchema, item, root, `${path}/${i}`));
    });
  }
  if (kind === 'object') {
    for (const name of schema.required ?? []) if (!(name in value)) bad(`missing ${name}`);
    for (const [name, child] of Object.entries(schema.properties ?? {})) {
      if (name in value) out.push(...errors(child, value[name], root, `${path}/${name}`));
    }
  }
  return out;
}

const omit = (object: Json, ...keys: string[]) =>
  Object.fromEntries(Object.entries(object).filter(([key]) => !keys.includes(key)));
const resolved = (branch: Json, root: Json): Json =>
  branch.$ref ? { ...pointer(root, branch.$ref), ...omit(branch, '$ref') } : branch;

const generate = async (body: Json, query = 'metadata=false&limit=1000') => postJson<Json>(`/generate?${query}`, body);

const records = async (body: Json, query?: string): Promise<Json[]> => {
  const { status, body: out } = await generate(body, query);
  expect(status, JSON.stringify(out)).toBe(200);
  return out as Json[];
};

const rejects = async (body: Json, pattern: RegExp, query?: string) => {
  const { status, body: out } = await generate(body, query);
  expect(status, JSON.stringify(out)).toBe(400);
  expect((out as { error: string }).error).toMatch(pattern);
};

afterEach(() => vi.restoreAllMocks());

describe('patterns, without running a regular expression', () => {
  const matches = (source: string, runs = 200) => {
    const pattern = compilePattern(source);
    let n = 0;
    const draw = (limit: number) => {
      n = (Math.imul(n, 1103515245) + 12345) >>> 0;
      return (n >>> 8) % limit;
    };
    const real = new RegExp(source);
    for (let i = 0; i < runs; i++) {
      const made = pattern.make(draw);
      expect(made, `${source} -> ${made}`).toMatch(real);
    }
  };

  it('makes strings that match what real schemas write', () => {
    for (const source of [
      '^[A-Z]{3}-\\d{4}$',
      '^\\d{3}-\\d{3}-\\d{4}$',
      '^[a-z0-9_-]{3,16}$',
      '^(Mr|Ms|Dr)\\. [A-Z][a-z]{2,8}$',
      '^[A-Fa-f0-9]{8}$',
      '^[^0-9]{4}$',
      '^(?:\\+1)?\\d{10}$',
      '^[a-z]+(-[a-z]+)*$',
      '^v\\d+\\.\\d+\\.\\d+$',
      '^.{5}$',
      'abc',
      '^x?y*z+$',
      '^[\\w.]{2,6}@[\\w]{3}\\.(com|org)$',
    ])
      matches(source);
  });

  it('refuses what it cannot make, naming it', () => {
    for (const [source, message] of [
      ['(?=a)b', /lookahead/],
      ['(?<name>a)', /lookahead and named/],
      ['\\bword', /\\b/],
      ['(a)\\1', /\\1/],
      ['a{2,1}', /counts down/],
      ['a{99}', /at most 64/],
      ['[z-a]', /counts down/],
      ['(a', /never closed/],
      ['[a', /never closed/],
      ['a)', /unexpected/],
      ['\\p{L}', /\\p/],
      ['a'.repeat(PATTERN_LIMITS.source + 1), /at most 200 characters/],
    ] as const) {
      expect(() => compilePattern(source), source).toThrow(PatternError);
      expect(() => compilePattern(source), source).toThrow(message);
    }
  });

  it('is capped in nodes, nesting, length and steps', () => {
    expect(() => compilePattern(`${'(a'.repeat(20)}${')'.repeat(20)}`)).toThrow(/nested at most 8/);
    expect(() => compilePattern('a|'.repeat(PATTERN_LIMITS.nodes))).toThrow(/at most 200 parts|at most 200 characters/);
    expect(() => compilePattern('(a{60}){60}').make(() => 0)).toThrow(/at most 256 characters|too much/);
    const spin = compilePattern('(((((a?){60}){60}){60}){60})');
    expect(() => spin.make(() => 0)).toThrow(/too much|at most 256/);
    expect(compilePattern('a{64}').make(() => 0)).toHaveLength(64);
  });
});

describe('POST /generate with a JSON Schema', () => {
  const schema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    required: ['id', 'email', 'state', 'createdAt'],
    properties: {
      id: { type: 'integer', minimum: 1, maximum: 5000 },
      uuid: { type: 'string', format: 'uuid' },
      email: { type: 'string', format: 'email' },
      name: { type: 'string' },
      state: { enum: ['active', 'paused', 'closed'] },
      kind: { const: 'user' },
      sku: { type: 'string', pattern: '^[A-Z]{3}-\\d{4}$' },
      code: { type: 'string', minLength: 6, maxLength: 8 },
      score: { type: 'number', minimum: 0, maximum: 1 },
      step: { type: 'integer', multipleOf: 5, minimum: 10, maximum: 100 },
      above: { type: 'number', exclusiveMinimum: 10, exclusiveMaximum: 20 },
      active: { type: 'boolean' },
      nickname: { type: ['string', 'null'] },
      createdAt: { type: 'string', format: 'date-time' },
      born: { type: 'string', format: 'date' },
      site: { type: 'string', format: 'uri' },
      tags: {
        type: 'array',
        items: { type: 'string', minLength: 3, maxLength: 9 },
        minItems: 2,
        maxItems: 4,
        uniqueItems: true,
      },
      pair: {
        type: 'array',
        prefixItems: [{ type: 'integer', minimum: 1, maximum: 9 }, { type: 'string' }],
        minItems: 2,
        maxItems: 2,
      },
      address: {
        type: 'object',
        required: ['city'],
        properties: {
          city: { type: 'string' },
          geo: {
            type: 'object',
            properties: {
              lat: { type: 'number', minimum: -90, maximum: 90 },
              lon: { type: 'number', minimum: -180, maximum: 180 },
            },
            required: ['lat', 'lon'],
          },
        },
      },
      pet: {
        oneOf: [
          {
            type: 'object',
            required: ['kind'],
            properties: { kind: { const: 'cat' }, lives: { type: 'integer', minimum: 1, maximum: 9 } },
          },
          { type: 'object', required: ['kind'], properties: { kind: { const: 'dog' }, good: { type: 'boolean' } } },
        ],
      },
      base: {
        allOf: [
          { $ref: '#/$defs/named' },
          { type: 'object', required: ['rank'], properties: { rank: { type: 'integer', minimum: 1, maximum: 3 } } },
        ],
      },
      secret: { type: 'string', writeOnly: true },
    },
    $defs: { named: { type: 'object', required: ['label'], properties: { label: { type: 'string', maxLength: 12 } } } },
  };

  it('makes records that match the schema, for several seeds and locales', async () => {
    for (const [seed, locale] of [
      [1, 'en-CA'],
      [2, 'ja'],
      [3, 'global'],
      [4, 'de'],
      [5, 'en-IN'],
    ] as const) {
      const rows = await records({ schema, count: 120, seed }, `metadata=false&limit=1000&locale=${locale}`);
      expect(rows).toHaveLength(120);
      for (const row of rows) {
        const { index, ...instance } = row;
        expect(Number.isInteger(index)).toBe(true);
        expect(errors(schema, instance, schema), JSON.stringify(row)).toEqual([]);
        expect('secret' in row).toBe(false);
      }
      // Optional properties are mostly there, and not always.
      const present = rows.filter((row) => 'name' in row).length;
      expect(present).toBeGreaterThan(60);
      expect(present).toBeLessThan(120);
    }
  });

  it('is repeatable for a seed, locale and schema, and different for another seed', async () => {
    const body = { schema, count: 30, seed: 9 };
    const a = await records(body);
    expect(await records(body)).toEqual(a);
    expect(await records({ ...body, seed: 10 })).not.toEqual(a);
    expect(await records(body, 'metadata=false&limit=1000&locale=ja')).not.toEqual(a);
  });

  it('answers with paging, sorting, filters, formats and the usual envelope', async () => {
    const { body } = await postJson<Envelope<Json>>('/generate?limit=5&sortBy=id:numeric&sortDirection=desc', {
      schema,
      count: 50,
      seed: 2,
    });
    expect(body.metadata.total).toBe(50);
    expect(body.results.map((row) => row.id)).toEqual(body.results.map((row) => row.id).toSorted((a, b) => b - a));
    expect(body.metadata.nextCursor).toBeTruthy();
    const csv = await postJson('/generate?limit=3&format=csv', { schema, count: 5 });
    expect(csv.text.split('\r\n')[0]).toMatch(/^index,id,/);
    expect((await postJson('/generate?limit=2&format=sql&table=people', { schema, count: 5 })).text).toContain(
      'INSERT INTO "people"',
    );
    const active = await records({ schema, count: 200 }, 'state=active&metadata=false&limit=1000');
    expect(active.length).toBeGreaterThan(30);
    expect(active.every((row) => row.state === 'active')).toBe(true);
  });

  it('uses safe emails and addresses when asked', async () => {
    const rows = await records(
      {
        schema: {
          type: 'object',
          required: ['email', 'site'],
          properties: {
            email: { type: 'string', format: 'email' },
            site: { type: 'string', format: 'uri' },
            contact: { type: 'string', 'x-generator': 'internet.email' },
          },
        },
        count: 50,
      },
      'metadata=false&limit=1000&safe=true',
    );
    for (const row of rows) {
      expect(row.email).toMatch(/@example\.(com|org|net)$/);
      expect(row.site).toMatch(/^https:\/\/[^/]*example\.(com|org|net)/);
    }
  });

  it('draws values by what a property is called, and by x-generator', async () => {
    const rows = await records({
      schema: {
        type: 'object',
        required: ['firstName', 'email', 'city', 'handle', 'age', 'price'],
        properties: {
          firstName: { type: 'string' },
          email: { type: 'string' },
          city: { type: 'string' },
          handle: { type: 'string', 'x-generator': 'internet.username' },
          age: { type: 'string', 'x-generator': 'number.int(18,65)' },
          price: { type: 'string', 'x-generator': 'commerce.price(5,10,2)' },
        },
      },
      count: 40,
    });
    for (const row of rows) {
      expect(row.email).toMatch(/^[^@\s]+@[^@\s]+$/);
      expect(row.firstName).toMatch(/^\p{L}[\p{L}'.\- ]*$/u);
      expect(Number(row.age)).toBeGreaterThanOrEqual(18);
      expect(Number(row.age)).toBeLessThanOrEqual(65);
      expect(Number(row.price)).toBeLessThanOrEqual(10);
    }
  });

  it('wraps a value that is not an object, and refuses a property called index', async () => {
    expect(
      (await records({ schema: { type: 'integer', minimum: 1, maximum: 3 }, count: 5 })).every((row) =>
        [1, 2, 3].includes(row.value),
      ),
    ).toBe(true);
    expect(
      (await records({ schema: { type: 'array', items: { type: 'integer' }, minItems: 2, maxItems: 2 }, count: 3 }))[0]
        .value,
    ).toHaveLength(2);
    await rejects(
      { schema: { type: 'object', required: ['index'], properties: { index: { type: 'integer' } } } },
      /"index" is reserved/,
    );
  });
});

describe('POST /generate with an OpenAPI document', () => {
  const document = {
    openapi: '3.0.3',
    info: { title: 'Pets', version: '1' },
    components: {
      schemas: {
        Pet: {
          type: 'object',
          required: ['id', 'name', 'owner'],
          properties: {
            id: { type: 'integer', format: 'int64', minimum: 1 },
            name: { type: 'string', maxLength: 20 },
            tag: { type: 'string', nullable: true },
            status: { type: 'string', enum: ['available', 'pending', 'sold'] },
            owner: { $ref: '#/components/schemas/Owner' },
            photos: { type: 'array', items: { type: 'string', format: 'uri' }, maxItems: 3 },
            friends: { type: 'array', items: { $ref: '#/components/schemas/Pet' } },
            internalNote: { type: 'string', writeOnly: true },
          },
        },
        Owner: {
          allOf: [
            { $ref: '#/components/schemas/Person' },
            { type: 'object', required: ['since'], properties: { since: { type: 'string', format: 'date' } } },
          ],
        },
        Person: {
          type: 'object',
          required: ['email'],
          properties: {
            email: { type: 'string', format: 'email' },
            age: { type: 'integer', minimum: 18, maximum: 99, exclusiveMinimum: true },
          },
        },
        Animal: { oneOf: [{ $ref: '#/components/schemas/Cat' }, { $ref: '#/components/schemas/Dog' }] },
        Cat: {
          type: 'object',
          required: ['kind', 'lives'],
          properties: { kind: { type: 'string', enum: ['cat'] }, lives: { type: 'integer', minimum: 1, maximum: 9 } },
        },
        Dog: {
          type: 'object',
          required: ['kind'],
          properties: { kind: { type: 'string', enum: ['dog'] }, good: { type: 'boolean' } },
        },
      },
    },
  };

  it('generates from a named component, following local references and a self-reference', async () => {
    const rows = await records({ openapi: document, component: 'Pet', count: 80, seed: 3 });
    const root = document;
    for (const row of rows) {
      const { index, ...instance } = row;
      expect(errors(pointer(root, '#/components/schemas/Pet'), instance, root), JSON.stringify(row)).toEqual([]);
      expect(index).toBeGreaterThanOrEqual(0);
      expect('internalNote' in row).toBe(false);
      expect(row.owner.since).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      if (row.owner.age !== undefined) expect(row.owner.age).toBeGreaterThan(18);
    }
    expect(rows.some((row) => Array.isArray(row.friends) && row.friends.length > 0)).toBe(true);
    expect(rows.some((row) => row.tag === null)).toBe(true);
  });

  it('draws one of a oneOf, and takes the only schema when there is one', async () => {
    const rows = await records({ openapi: document, component: 'Animal', count: 60 });
    expect(new Set(rows.map((row) => row.kind))).toEqual(new Set(['cat', 'dog']));
    for (const row of rows) if (row.kind === 'cat') expect(row.lives).toBeGreaterThanOrEqual(1);
    const single = {
      openapi: '3.0.0',
      components: { schemas: { Thing: { type: 'object', required: ['n'], properties: { n: { type: 'integer' } } } } },
    };
    expect((await records({ openapi: single, count: 2 }))[0].n).toBeTypeOf('number');
  });

  it('reads Swagger 2 definitions', async () => {
    const swagger = {
      swagger: '2.0',
      definitions: {
        Item: {
          type: 'object',
          required: ['id', 'child'],
          properties: { id: { type: 'integer' }, child: { $ref: '#/definitions/Leaf' } },
        },
        Leaf: { type: 'object', required: ['v'], properties: { v: { type: 'string' } } },
      },
    };
    const rows = await records({ openapi: swagger, component: 'Item', count: 3 });
    expect(rows[0].child.v).toBeTypeOf('string');
  });

  it('says which component to use, and which exist', async () => {
    await rejects({ openapi: document }, /name the schema.*Pet.*Owner/);
    await rejects({ openapi: document, component: 'Nope' }, /no schema "Nope".*Pet/);
    await rejects({ openapi: { openapi: '3.0.0' }, component: 'x' }, /no components\.schemas/);
  });
});

describe('references and loops', () => {
  it('cuts a loop where the property is optional and the list may be empty', async () => {
    const tree = {
      $ref: '#/$defs/node',
      $defs: {
        node: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'integer' },
            parent: { $ref: '#/$defs/node' },
            children: { type: 'array', items: { $ref: '#/$defs/node' } },
          },
        },
      },
    };
    const rows = await records({ schema: tree, count: 200, seed: 4 });
    let deepest = 0;
    const depth = (value: Json, at = 0): number => {
      let best = at;
      if (value && typeof value === 'object') {
        for (const child of Object.values(value))
          best = Math.max(best, depth(child, at + (Array.isArray(value) ? 0 : 1)));
      }
      return best;
    };
    for (const row of rows) deepest = Math.max(deepest, depth(row));
    expect(deepest).toBeLessThanOrEqual(SCHEMA_LIMITS.depth + 1);
    expect(deepest).toBeGreaterThan(1);
  });

  it('refuses a loop that cannot end', async () => {
    await rejects(
      {
        schema: {
          $ref: '#/$defs/a',
          $defs: {
            a: { type: 'object', required: ['b'], properties: { b: { $ref: '#/$defs/b' } } },
            b: { type: 'object', required: ['a'], properties: { a: { $ref: '#/$defs/a' } } },
          },
        },
      },
      /nest more than 8 deep/,
    );
    await rejects(
      { schema: { $ref: '#/$defs/a', $defs: { a: { $ref: '#/$defs/b' }, b: { $ref: '#/$defs/a' } } } },
      /loop|nest more than 32/,
    );
    await rejects(
      {
        schema: {
          type: 'object',
          required: ['l'],
          properties: { l: { type: 'array', minItems: 1, items: { $ref: '#' } } },
        },
      },
      /nest more than 8 deep/,
    );
    await rejects({ schema: { allOf: [{ $ref: '#' }] } }, /loop|nest more than 32/);
  });

  it('follows no reference outside the document, and fetches nothing', async () => {
    const fetched = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('the network must not be used'));
    for (const ref of [
      'https://example.com/schema.json',
      'http://localhost:6800/openapi.json',
      'file:///etc/passwd',
      './other.json',
      '../up.json#/a',
      'other.json#/definitions/x',
      '/abs/path.json',
      'urn:uuid:123',
    ]) {
      await rejects(
        { schema: { type: 'object', required: ['a'], properties: { a: { $ref: ref } } } },
        /points outside the schema|not a local JSON pointer/,
      );
    }
    await rejects(
      { schema: { type: 'object', properties: { a: { $ref: '#/$defs/missing' } } } },
      /does not point at anything/,
    );
    await rejects({ schema: { type: 'object', properties: { a: { $ref: '#foo' } } } }, /not a local JSON pointer/);
    await rejects(
      { schema: { type: 'object', properties: { a: { $ref: '#/properties/b' }, b: 1 } } },
      /does not point at a schema|does not point/,
    );
    await rejects({ schema: { type: 'object', properties: { a: { $ref: 7 } } } }, /\$ref must be a string/);
    expect(fetched).not.toHaveBeenCalled();
  });
});

describe('what the generator will not do', () => {
  it('names every unsupported keyword instead of ignoring it', async () => {
    for (const keyword of [
      'not',
      'if',
      'then',
      'else',
      'patternProperties',
      'propertyNames',
      'contains',
      'dependentSchemas',
      'dependentRequired',
      'dependencies',
      'unevaluatedProperties',
      'unevaluatedItems',
      '$dynamicRef',
    ]) {
      await rejects(
        { schema: { type: 'object', properties: { a: { type: 'string', [keyword]: {} } } } },
        new RegExp(`"${keyword.replace('$', '\\$')}" is not supported`),
      );
    }
    await rejects({ schema: { type: 'object', properties: { a: { type: 'wat' } } } }, /type "wat"/);
    await rejects({ schema: { type: 'object', properties: { a: false } } }, /allows no value/);
    await rejects({ schema: { type: 'string', pattern: '(?=a)' } }, /the pattern/);
    await rejects({ schema: { type: 'string', 'x-generator': 'nope.nothing' } }, /x-generator/);
    await rejects({ schema: { type: 'string', 'x-generator': '=1+1' } }, /x-generator/);
    await rejects(
      { schema: { type: 'object', properties: { a: { type: 'integer', minimum: 5, maximum: 1 } } } },
      /minimum is more than maximum/,
    );
    await rejects({ schema: { type: 'integer', multipleOf: 100, minimum: 1, maximum: 50 } }, /no multiple of 100/);
    await rejects({ schema: { type: 'string', minLength: 9, maxLength: 3 } }, /minLength is more than maxLength/);
  });

  it('holds a schema to its limits', async () => {
    const { items, string, properties, enum: enums, schemaNodes, recordNodes } = SCHEMA_LIMITS;
    await rejects({ schema: { type: 'array', minItems: items + 1 } }, /minItems of 21 is more than the 20/);
    await rejects({ schema: { type: 'string', minLength: string + 1 } }, /minLength of 257 is more than the 256/);
    await rejects(
      {
        schema: {
          type: 'object',
          properties: Object.fromEntries(
            Array.from({ length: properties + 1 }, (_, i) => [`p${i}`, { type: 'string' }]),
          ),
        },
      },
      /at most 100 properties/,
    );
    await rejects({ schema: { enum: Array.from({ length: enums + 1 }, (_, i) => i) } }, /at most 500 values/);
    await rejects(
      { schema: { allOf: Array.from({ length: schemaNodes + 1 }, () => ({ type: 'object' })) } },
      /at most 2000 parts/,
    );
    await rejects(
      {
        schema: {
          type: 'array',
          minItems: 20,
          maxItems: 20,
          items: {
            type: 'array',
            minItems: 20,
            maxItems: 20,
            items: { type: 'array', minItems: 20, maxItems: 20, items: { type: 'string' } },
          },
        },
      },
      new RegExp(`more than ${recordNodes} values`),
    );
    // Longer than the cap is not an error: it is made at the cap.
    const rows = await records({
      schema: { type: 'array', items: { type: 'integer' }, minItems: 1, maxItems: 100000 },
      count: 40,
    });
    for (const row of rows) expect(row.value.length).toBeLessThanOrEqual(items);
    const long = await records({ schema: { type: 'string', minLength: 1, maxLength: 100000 }, count: 40 });
    for (const row of long) expect(row.value.length).toBeLessThanOrEqual(string);
  });

  it('holds a request to its limit of values, whatever the count', async () => {
    const schema = {
      type: 'object',
      required: ['rows'],
      properties: {
        rows: {
          type: 'array',
          minItems: 20,
          maxItems: 20,
          items: {
            type: 'object',
            required: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'],
            properties: Object.fromEntries('abcdefghij'.split('').map((key) => [key, { type: 'integer' }])),
          },
        },
      },
    };
    await rejects({ schema, count: 1000 }, /more than 200000 values for 1000 records/);
    expect((await records({ schema, count: 200 })).length).toBe(200);
  });

  it('holds a request to the size of a response, and charges generators and patterns for what they cost', async () => {
    const text = { type: 'string', 'x-generator': 'lorem.paragraphs(10)' };
    const schema = {
      type: 'object',
      required: ['a'],
      properties: { a: { type: 'array', minItems: 20, maxItems: 20, items: text } },
    };
    await rejects({ schema, count: 1000 }, /more than 4,000,000 characters for 1000 records/);
    const some = await records({ schema, count: 400 }, 'metadata=false&limit=400');
    expect(JSON.stringify(some).length).toBeLessThan(4_000_000);
    // A pattern that spins is charged for its steps, so a record of them is refused rather than slow.
    await rejects(
      {
        schema: {
          type: 'array',
          minItems: 20,
          maxItems: 20,
          items: { type: 'string', pattern: '^((a?){10}){10}[a-z]{50}$' },
        },
      },
      /more than 500 values/,
    );
  });

  it('is a valid request only with exactly one of fields, schema or openapi', async () => {
    const both = await generate({ fields: { a: 'person.firstName' }, schema: { type: 'string' } });
    expect(both.status).toBe(400);
    expect((both.body as unknown as { error: string }).error).toMatch(/exactly one of fields, schema or openapi/);
    expect((await generate({})).status).toBe(400);
    expect((await generate({ schema: 'nope' })).status).toBe(400);
    expect((await generate({ schema: { type: 'string' }, count: 1001 })).status).toBe(400);
    await rejects({ schema: { type: 'string' }, constraints: ['a>b'] }, /constraints work on a field list/);
    expect(
      (await request('/generate', { method: 'POST', body: '{', headers: { 'Content-Type': 'application/json' } }))
        .status,
    ).toBe(400);
  });
});
