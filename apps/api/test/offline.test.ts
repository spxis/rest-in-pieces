import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type CliCommand, CliError, type GenerateOptions, MAX_OFFLINE_RECORDS, parseCliArgs } from '../src/cli.ts';
import { generateOffline, MAX_SCHEMA_FILE, readSchemaFile, runGenerateCommand, type Sink } from '../src/offline.ts';
import { postJson, request } from './helpers.ts';

let dir = '';
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'rest-in-pieces-offline-'));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const options = (overrides: Partial<GenerateOptions> = {}): GenerateOptions => ({
  constraints: [],
  count: 10,
  seed: 1,
  format: 'ndjson',
  table: 'records',
  batch: 1,
  transaction: false,
  bom: false,
  locale: 'en-CA',
  safe: false,
  baseUrl: 'http://localhost:6800',
  ...overrides,
});

const collect = () => {
  const chunks: string[] = [];
  const sink: Sink = { write: (text) => void chunks.push(text) };
  return { chunks, sink, text: () => chunks.join('') };
};

const run = async (opts: GenerateOptions, schema?: unknown) => {
  const out = collect();
  const result = await generateOffline(opts, schema, out.sink);
  return { ...out, result };
};

const schema = {
  type: 'object',
  required: ['id', 'email', 'status'],
  properties: {
    id: { type: 'integer', minimum: 1, maximum: 99999 },
    email: { type: 'string', format: 'email' },
    name: { type: 'string' },
    status: { enum: ['active', 'paused', "it's"] },
    sku: { type: 'string', pattern: '^[A-Z]{3}-\\d{4}$' },
    tags: { type: 'array', items: { type: 'string' }, maxItems: 3 },
  },
};

describe('rest-in-pieces generate: arguments', () => {
  const ok = (...argv: string[]) => parseCliArgs(['generate', ...argv]) as Extract<CliCommand, { kind: 'generate' }>;

  it('reads a schema file with its defaults', () => {
    expect(ok('--schema', 's.json')).toEqual({
      kind: 'generate',
      schema: 's.json',
      constraints: [],
      count: 1000,
      seed: 1,
      format: 'ndjson',
      table: 'records',
      batch: 1,
      transaction: false,
      bom: false,
      locale: 'en-CA',
      safe: true,
      baseUrl: 'http://localhost:6800',
    });
  });

  it('reads every option, with a space or an equals sign', () => {
    const command = ok(
      '--schema=s.json',
      '--component',
      'Pet',
      '--count',
      '100000',
      '--seed=7',
      '--format',
      'sql',
      '--table',
      'pets',
      '--batch',
      '50',
      '--transaction',
      '--locale',
      'ja',
      '--safe',
      '--base-url',
      'https://api.test/',
      '--output',
      'out.sql',
    );
    expect(command).toMatchObject({
      schema: 's.json',
      component: 'Pet',
      count: 100000,
      seed: 7,
      format: 'sql',
      table: 'pets',
      batch: 50,
      transaction: true,
      locale: 'ja',
      safe: true,
      baseUrl: 'https://api.test',
      output: 'out.sql',
    });
    expect(ok('--openapi', 'api.yaml')).toMatchObject({ schema: 'api.yaml' });
    expect(
      ok('--fields', 'a:person.fullName,b:=upper(a)', '--constraints', 'x>y, y<z', '--format', 'csv', '--bom'),
    ).toMatchObject({ fields: 'a:person.fullName,b:=upper(a)', constraints: ['x>y', 'y<z'], bom: true });
    expect(ok('--schema', 's.json', '--count', String(MAX_OFFLINE_RECORDS)).count).toBe(10_000_000);
    expect(parseCliArgs(['generate', '--help'])).toEqual({ kind: 'help-generate' });
    expect(parseCliArgs(['generate', '--schema', 's.json', '-h'])).toEqual({ kind: 'help-generate' });
  });

  it('refuses what it cannot use, in a sentence', () => {
    const bad: [string[], RegExp][] = [
      [[], /one of --schema <file> or --fields <list>/],
      [['--schema', 'a', '--fields', 'b:c'], /one of --schema/],
      [['--schema', 's.json', '--count', '0'], /--count must be a whole number from 1 to 10,000,000/],
      [['--schema', 's.json', '--count', '10000001'], /--count must be/],
      [['--schema', 's.json', '--count', '1e3'], /--count must be/],
      [['--schema', 's.json', '--seed', '-1'], /--seed/],
      [['--schema', 's.json', '--seed', '4294967296'], /--seed must be a whole number from 0 to 4,294,967,295/],
      [['--schema', 's.json', '--format', 'xml'], /--format must be one of ndjson, json, csv, sql; got "xml"/],
      [['--schema', 's.json', '--format', 'sql', '--table', 'a-b'], /--table "a-b" is not a name/],
      [['--schema', 's.json', '--table', 'pets'], /--table works with --format sql/],
      [['--schema', 's.json', '--batch', '5'], /--batch works with --format sql/],
      [['--schema', 's.json', '--format', 'sql', '--batch', '1001'], /--batch must be/],
      [['--schema', 's.json', '--bom'], /--bom works with --format csv/],
      [['--schema', 's.json', '--constraints', 'a>b'], /--constraints works with --fields/],
      [['--fields', 'a:b', '--component', 'X'], /--component works with --schema/],
      [['--schema'], /--schema needs a value/],
      [['--schema', '--count'], /--schema needs a value/],
      [['--schema', 'a', '--schema', 'b'], /given twice/],
      [['--schema', 's.json', '--nope'], /Unknown option: --nope/],
      [['--schema', 's.json', '--safe=yes'], /Unknown option|needs a value/],
    ];
    for (const [argv, message] of bad)
      expect(() => parseCliArgs(['generate', ...argv]), argv.join(' ')).toThrow(message);
    expect(() => parseCliArgs(['generate', '--nope'])).toThrow(CliError);
  });
});

describe('rest-in-pieces generate: the same records as the API', () => {
  it('writes ndjson that matches POST /generate, and the first records of a bigger run', async () => {
    const api = (
      await postJson<{ results: unknown[] }>('/generate?limit=1000&safe=false', { schema, count: 30, seed: 5 })
    ).body.results;
    const offline = (await run(options({ count: 30, seed: 5 }), schema))
      .text()
      .trimEnd()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(offline).toEqual(api);
    const more = (await run(options({ count: 200, seed: 5 }), schema))
      .text()
      .trimEnd()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(more.slice(0, 30)).toEqual(api);
  });

  it('matches a field list in every format and locale', async () => {
    const list =
      "name:person.fullName,age:number.int(18,65),status:pick(a,b|1,2),born:date.between(2000-01-01,2001-01-01),ref:=concat(name, '-', age)";
    for (const locale of ['en-CA', 'ja', 'global', 'de']) {
      const query = `fields=${encodeURIComponent(list)}&locale=${locale}&seed=3&limit=40&count=40`;
      const json = (await request<{ results: unknown[] }>(`/generate?${query}`)).body.results;
      const base = options({ fields: list, count: 40, seed: 3, locale });
      expect(
        (await run({ ...base, format: 'ndjson' }))
          .text()
          .trimEnd()
          .split('\n')
          .map((line) => JSON.parse(line)),
        locale,
      ).toEqual(json);
      expect(JSON.parse((await run({ ...base, format: 'json' })).text()), locale).toEqual(json);
      expect((await run({ ...base, format: 'csv' })).text(), locale).toBe(
        (await request(`/generate?${query}&format=csv`)).text.replace(/^﻿/, ''),
      );
      expect((await run({ ...base, format: 'sql', table: 'people' })).text(), locale).toBe(
        (await request(`/generate?${query}&format=sql&table=people`)).text,
      );
    }
  });

  it('writes csv with the same cells, a byte-order mark when asked, and sql with the API quoting', async () => {
    const csv = (await run(options({ format: 'csv', count: 20, seed: 2 }), schema)).text();
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('index,id,email,name,status,sku,tags');
    expect(lines).toHaveLength(22);
    expect(lines.slice(1, 21).some((line) => line.includes('""'))).toBe(true);
    expect((await run(options({ format: 'csv', bom: true, count: 1 }), schema)).text().startsWith('﻿index,')).toBe(true);
    const sql = (await run(options({ format: 'sql', table: 'people', count: 60, seed: 2 }), schema)).text();
    expect(sql.split('\n').filter(Boolean)).toHaveLength(60);
    expect(sql).toMatch(
      /^INSERT INTO "people" \("index", "id", "email", "name", "status", "sku", "tags"\) VALUES \(0, \d+, '[^']+', /,
    );
    expect(sql).toContain("'it''s'");
    expect(sql).toContain('NULL');
    expect(sql).toMatch(/'\[("[^"]*"(,"[^"]*")*)?\]'/);
  });

  it('batches inserts and wraps them in a transaction', async () => {
    const text = (await run(options({ format: 'sql', count: 10, batch: 4, transaction: true }), schema)).text();
    expect(text.startsWith('BEGIN;\n')).toBe(true);
    expect(text.endsWith(';\nCOMMIT;\n')).toBe(true);
    const statements = text.split(/;\n/).filter((part) => part.startsWith('INSERT'));
    expect(statements).toHaveLength(3);
    expect(statements.map((statement) => statement.split('\n').length)).toEqual([4, 4, 2]);
    expect(text.match(/\(\d+, /g)).toHaveLength(10);
  });

  it('writes an empty-looking json array and a table of one column', async () => {
    const one = await run(options({ format: 'json', count: 1 }), schema);
    expect(JSON.parse(one.text())).toHaveLength(1);
    const values = await run(options({ format: 'csv', count: 3 }), { type: 'integer', minimum: 1, maximum: 3 });
    expect(values.text().split('\r\n')[0]).toBe('index,value');
  });

  it('draws safe values, with avatars at the base url', async () => {
    const text = (
      await run(options({ safe: true, count: 20, baseUrl: 'https://mock.test' }), {
        type: 'object',
        required: ['email', 'photo'],
        properties: {
          email: { type: 'string', format: 'email' },
          photo: { type: 'string', 'x-generator': 'image.avatar' },
        },
      })
    ).text();
    for (const line of text.trimEnd().split('\n')) {
      const row = JSON.parse(line);
      expect(row.email).toMatch(/@example\.(com|org|net)$/);
      expect(row.photo).toMatch(/^https:\/\/mock\.test\/avatars\//);
    }
  });

  it('reads an OpenAPI document with the component named', async () => {
    const doc = {
      openapi: '3.0.3',
      components: {
        schemas: {
          Pet: { type: 'object', required: ['id'], properties: { id: { type: 'integer' } } },
          Cat: { type: 'object', required: ['n'], properties: { n: { type: 'integer' } } },
        },
      },
    };
    expect(JSON.parse((await run(options({ count: 1, component: 'Cat' }), doc)).text())).toHaveProperty('n');
    await expect(run(options({ count: 1 }), doc)).rejects.toThrow(/name the schema/);
  });
});

describe('rest-in-pieces generate: any number, one at a time', () => {
  it('writes in chunks and holds no more than one at a time', async () => {
    const { chunks, result } = await run(options({ count: 30000, format: 'ndjson' }), schema);
    expect(result.records).toBe(30000);
    expect(chunks.length).toBeGreaterThan(10);
    expect(Math.max(...chunks.map((chunk) => chunk.length))).toBeLessThan(200_000);
    expect(chunks.join('').trimEnd().split('\n')).toHaveLength(30000);
  }, 60_000);

  it('does not stop at what one request may ask for', async () => {
    // 2,000 records of a record that is 500 values wide is more than 200,000 values: the API refuses, the command writes.
    const wide = {
      type: 'object',
      required: ['a'],
      properties: {
        a: {
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
    expect((await postJson('/generate', { schema: wide, count: 1000 })).status).toBe(400);
    const { result } = await run(options({ count: 1000 }), wide);
    expect(result.records).toBe(1000);
  }, 60_000);

  it('still stops one record that runs away', async () => {
    const runaway = {
      type: 'array',
      minItems: 20,
      maxItems: 20,
      items: {
        type: 'array',
        minItems: 20,
        maxItems: 20,
        items: { type: 'array', minItems: 20, maxItems: 20, items: { type: 'string' } },
      },
    };
    await expect(run(options({ count: 2 }), runaway)).rejects.toThrow(/more than 500 values/);
  });

  it('leaves the shared fakers as it found them', async () => {
    const before = (await request('/names?limit=3')).text;
    await run(options({ count: 50 }), schema);
    expect((await request('/names?limit=3')).text).toBe(before);
  });
});

describe('rest-in-pieces generate: files and errors', () => {
  it('reads JSON and YAML, and says what is wrong with a file', () => {
    const json = join(dir, 's.json');
    writeFileSync(json, JSON.stringify(schema));
    expect(readSchemaFile(json)).toEqual(schema);
    const yaml = join(dir, 's.yaml');
    writeFileSync(yaml, 'type: object\nrequired: [id]\nproperties:\n  id: { type: integer }\n');
    expect(readSchemaFile(yaml)).toEqual({ type: 'object', required: ['id'], properties: { id: { type: 'integer' } } });
    expect(() => readSchemaFile(join(dir, 'missing.json'))).toThrow(/Cannot read .*missing\.json: no such file/);
    const broken = join(dir, 'broken.json');
    writeFileSync(broken, '{ nope');
    expect(() => readSchemaFile(broken)).toThrow(/broken\.json is not valid JSON/);
    const brokenYaml = join(dir, 'broken.yml');
    writeFileSync(brokenYaml, 'a: [');
    expect(() => readSchemaFile(brokenYaml)).toThrow(/is not valid YAML/);
    const big = join(dir, 'big.json');
    writeFileSync(big, ' '.repeat(MAX_SCHEMA_FILE + 1));
    expect(() => readSchemaFile(big)).toThrow(/larger than 5 MB/);
  });

  const io = () => {
    const stdout = new PassThrough();
    const out: string[] = [];
    stdout.on('data', (chunk: Buffer) => out.push(chunk.toString()));
    const err: string[] = [];
    return { stdout, out, err, io: { stdout, stderr: (text: string) => void err.push(text) } };
  };

  it('writes to standard output, or to a file with a summary', async () => {
    const file = join(dir, 'in.json');
    writeFileSync(file, JSON.stringify(schema));
    const a = io();
    expect(await runGenerateCommand(options({ schema: file, count: 5 }), a.io)).toBe(0);
    await new Promise((resolve) => setImmediate(resolve));
    expect(a.out.join('').trimEnd().split('\n')).toHaveLength(5);
    expect(a.err).toEqual([]);
    const target = join(dir, 'out.ndjson');
    const b = io();
    expect(await runGenerateCommand(options({ schema: file, count: 50, output: target }), b.io)).toBe(0);
    expect(readFileSync(target, 'utf8').trimEnd().split('\n')).toHaveLength(50);
    expect(b.err.join('')).toMatch(/^Wrote 50 records \(0\.\d MB\) to .*out\.ndjson in \d+\.\d s\.\n$/);
  });

  it('answers a schema it cannot use with an exit code and a sentence, and leaves no half-written file', async () => {
    const bad = join(dir, 'bad.json');
    writeFileSync(bad, JSON.stringify({ type: 'object', properties: { a: { not: {} } } }));
    const target = join(dir, 'never.sql');
    const c = io();
    expect(await runGenerateCommand(options({ schema: bad, output: target, format: 'sql' }), c.io)).toBe(1);
    expect(c.err.join('')).toMatch(/^error: "\/a": the keyword "not" is not supported/);
    expect(() => readFileSync(target)).toThrow(/ENOENT/);
    const d = io();
    expect(await runGenerateCommand(options({ schema: join(dir, 'missing.json') }), d.io)).toBe(1);
    expect(d.err.join('')).toMatch(/^error: Cannot read/);
    const e = io();
    expect(await runGenerateCommand(options({ fields: 'a:nope.nothing' }), e.io)).toBe(1);
    expect(e.err.join('')).toMatch(/Unknown generator type/);
    const f = io();
    expect(await runGenerateCommand(options({ fields: 'a:person.fullName', locale: 'xx' }), f.io)).toBe(1);
    expect(f.err.join('')).toMatch(/error: /);
    const g = io();
    expect(await runGenerateCommand(options({ fields: 'a:number.int(5,1)' }), g.io)).toBe(1);
    expect(g.err.join('')).toMatch(/Field "a"/);
  });
});
