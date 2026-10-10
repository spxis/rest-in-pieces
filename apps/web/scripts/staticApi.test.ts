// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '@johnmorrisdotca/rest-in-pieces/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  PLACEHOLDER_NESTED,
  relink,
  STATIC_DEFAULT_LOCALE_ONLY,
  STATIC_FORMATS,
  STATIC_INDEX_FILE,
  STATIC_LOCALES,
  STATIC_PAGE_SIZE,
  STATIC_RECORDS,
  type StaticApiIndex,
  staticFilesOnDisk,
  writeStaticApi,
} from './staticApi.ts';

const BASE = 'https://example.test/rest-in-pieces/api/';
const app = createApp();
let dir = '';
let index: StaticApiIndex;

interface Links {
  links: Record<string, string | null>;
  nextCursor: null;
  prevCursor: null;
}
/** A file as parsed: an envelope, a bare array, or an item, which the test narrows where it reads one. */
interface Doc {
  metadata?: Links;
  results?: Record<string, unknown>[];
  [key: string]: unknown;
}
const read = (path: string): Doc & unknown[] => JSON.parse(readFileSync(join(dir, path), 'utf8'));
let files: Set<string>;
const onDisk = () => files;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'rest-in-pieces-static-api-'));
  index = await writeStaticApi(app, dir, BASE);
  files = new Set(staticFilesOnDisk(dir));
}, 120_000);

afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe('the static API', () => {
  it('writes an index that counts the files, and every file is JSON that parses', () => {
    expect(files.has(STATIC_INDEX_FILE)).toBe(true);
    expect(index.files).toBe(files.size - 1);
    expect(read(STATIC_INDEX_FILE)).toEqual(JSON.parse(JSON.stringify(index)));
    expect(index.base).toBe(BASE);
    for (const file of files) {
      expect(/\.(json|csv|ndjson|sql)$/.test(file), file).toBe(true);
      if (file.endsWith('.json')) expect(() => read(file), file).not.toThrow();
    }
  });

  it('holds the first hundred records of every seeded dataset, and every record of the real ones, in pages of ten, in the default locale and Japanese', async () => {
    const resources = (await (await app.request('/resources')).json()) as { name: string; seeded: boolean }[];
    expect(Object.keys(index.datasets)).toEqual([index.defaultLocale, ...STATIC_LOCALES]);
    for (const [locale, datasets] of Object.entries(index.datasets)) {
      const folder = index.folders[locale];
      const expected = resources.filter(
        ({ name }) => locale === index.defaultLocale || !STATIC_DEFAULT_LOCALE_ONLY.has(name),
      );
      expect(datasets.map((dataset) => dataset.name)).toEqual(expected.map(({ name }) => name));
      for (const dataset of datasets) {
        // Seeded data is cut to its first hundred; real reference data (countries, regions) is whole.
        if (resources.find(({ name }) => name === dataset.name)?.seeded)
          expect(dataset.records).toBeLessThanOrEqual(STATIC_RECORDS);
        expect(dataset.pages).toBe(Math.ceil(dataset.records / STATIC_PAGE_SIZE));
        const list = read(`${folder}${dataset.name}.json`);
        expect(list).toEqual(read(`${folder}${dataset.name}/page/1.json`));
        const ids: string[] = [];
        for (let page = 1; page <= dataset.pages; page += 1) {
          const body: Doc | unknown[] = read(`${folder}${dataset.name}/page/${page}.json`);
          const records = (Array.isArray(body) ? body : (body as Doc).results) as Record<string, unknown>[];
          expect(records.length).toBeLessThanOrEqual(STATIC_PAGE_SIZE);
          for (const record of records) ids.push(String(record[dataset.idField]));
        }
        expect(ids).toHaveLength(dataset.records);
        expect(onDisk().has(`${folder}${dataset.name}/page/${dataset.pages + 1}.json`)).toBe(false);
        for (const id of ids)
          expect(onDisk().has(`${folder}${dataset.name}/${id}.json`), `${dataset.name}/${id}`).toBe(true);
      }
    }
  });

  it('points every link at a file that exists, and never at the API or a cursor', () => {
    let linked = 0;
    for (const file of [...files].filter((one) => one.endsWith('.json'))) {
      const metadata = (read(file) as Doc).metadata;
      if (!metadata) continue;
      expect(metadata.nextCursor).toBeNull();
      expect(metadata.prevCursor).toBeNull();
      for (const link of Object.values(metadata.links)) {
        if (link === null) continue;
        expect(link.startsWith(BASE), link).toBe(true);
        expect(files.has(link.slice(BASE.length)), `${file} links ${link}`).toBe(true);
        linked += 1;
      }
    }
    expect(linked).toBeGreaterThan(1000);
    // The ends of a list have nothing before or after them.
    const links = read('users/page/1.json').metadata?.links;
    expect(links?.prev).toBeNull();
    expect(links?.next).toBe(`${BASE}users/page/2.json`);
    expect(links?.last).toBe(`${BASE}users/page/10.json`);
    expect(read('users/page/10.json').metadata?.links.next).toBeNull();
  });

  it('holds a record exactly as the API answers it, and the lists a record owns', async () => {
    for (const [file, request] of [
      ['users/1.json', '/users/1?seed=1&locale=en-CA&max=100'],
      ['ja/products/7.json', '/products/7?seed=1&locale=ja&max=100'],
      ['countries/AD.json', '/countries/AD?locale=en-CA'],
    ] as const) {
      expect(readFileSync(join(dir, file), 'utf8'), file).toBe(await (await app.request(request)).text());
    }
    const orders = read('users/1/orders.json');
    const live = (await (await app.request('/users/1/orders?seed=1&locale=en-CA&limit=1000')).json()) as {
      results: unknown[];
    };
    expect(orders.results).toEqual(live.results);
    const users = index.datasets[index.defaultLocale]?.find((dataset) => dataset.name === 'users');
    expect(users?.nested).toEqual(['orders', 'posts', 'todos']);
    for (let id = 1; id <= STATIC_RECORDS; id += 1) {
      for (const list of users?.nested ?? []) expect(onDisk().has(`users/${id}/${list}.json`)).toBe(true);
    }
  });

  it('serves JSONPlaceholder shapes and lengths as bare arrays', () => {
    expect(index.jsonplaceholder.lists).toEqual({ posts: 100, comments: 500, todos: 200, users: 10 });
    expect(index.jsonplaceholder.nested).toEqual(PLACEHOLDER_NESTED);
    for (const [name, length] of Object.entries(index.jsonplaceholder.lists)) {
      expect(read(`jsonplaceholder/${name}.json`)).toHaveLength(length);
    }
    const user = read('jsonplaceholder/users/1.json');
    expect(user).toMatchObject({ id: 1, name: expect.any(String), company: { name: expect.any(String) } });
    expect(read('jsonplaceholder/posts/1/comments.json')).toBeInstanceOf(Array);
    expect(onDisk().has('jsonplaceholder/users/10/todos.json')).toBe(true);
    expect(onDisk().has('jsonplaceholder/users/11.json')).toBe(false);
  });

  it('keeps every file small enough to open in a browser tab', () => {
    for (const file of files) {
      // A JSON file is one page or one record's list; the SQL and NDJSON of the same JSONPlaceholder list are a little longer.
      expect(statSync(join(dir, file)).size, file).toBeLessThan(file.endsWith('.json') ? 400_000 : 600_000);
    }
  });
});

describe('relink', () => {
  const links = { self: '/x?offset=10', first: '/x?offset=0', last: '/x?offset=90', prev: null, next: '/x?offset=20' };
  const body = { metadata: { links, nextCursor: 'abc', prevCursor: 'def', parameters: { size: 10 } }, results: [1] };

  it('maps an offset to the page that holds it, drops the cursors, and nulls a page that is not held', () => {
    const out = relink(body, (page) => (page <= 3 ? `p${page}` : null)) as typeof body;
    expect(out.metadata.links).toEqual({ self: 'p2', first: 'p1', last: null, prev: null, next: 'p3' });
    expect(out.metadata.nextCursor).toBeNull();
    expect(out.metadata.prevCursor).toBeNull();
    expect(out.results).toEqual([1]);
    expect(body.metadata.nextCursor).toBe('abc');
  });

  it('leaves a bare array and a body without metadata alone', () => {
    expect(relink([1, 2], () => 'x')).toEqual([1, 2]);
    expect(relink({ a: 1 }, () => 'x')).toEqual({ a: 1 });
    expect(relink(null, () => 'x')).toBeNull();
  });
});

describe('the formats beside every JSON file', () => {
  const json = () => [...files].filter((file) => file.endsWith('.json') && file !== STATIC_INDEX_FILE);
  /** The records of a JSON file, whether it is an envelope, a bare array or one record. */
  const recordsOf = (file: string): Record<string, unknown>[] => {
    const body = read(file) as unknown;
    if (Array.isArray(body)) return body as Record<string, unknown>[];
    const envelope = body as { results?: Record<string, unknown>[] };
    return envelope.results ?? [body as Record<string, unknown>];
  };

  it('has a .csv, a .ndjson and a .sql for every .json, and lists the formats in index.json', () => {
    expect(index.formats).toEqual(['json', 'csv', 'ndjson', 'sql']);
    expect(index.paths.item).toBe('{dataset}/{id}.{format}');
    for (const file of json()) {
      for (const format of STATIC_FORMATS)
        expect(files.has(file.replace(/\.json$/, `.${format}`)), `${file} has no .${format}`).toBe(true);
    }
    // And nothing else: every csv, ndjson and sql file has a .json beside it.
    for (const file of files) {
      if (/\.(csv|ndjson|sql)$/.test(file))
        expect(files.has(file.replace(/\.[a-z]+$/, '.json')), `${file} has no .json`).toBe(true);
    }
  });

  it('holds the same records as the JSON, by spot-checking a page, a record and a list in each format', () => {
    for (const stem of [
      'users/page/2',
      'users/1',
      'users/1/orders',
      'ja/products',
      'countries/JP',
      'withdrawn/SUHH',
      'jsonplaceholder/posts',
    ]) {
      const records = recordsOf(`${stem}.json`);
      const ndjson = readFileSync(join(dir, `${stem}.ndjson`), 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as Record<string, unknown>);
      expect(ndjson, stem).toEqual(records);
      const csv = readFileSync(join(dir, `${stem}.csv`), 'utf8')
        .replace(/^\uFEFF/, '')
        .trim()
        .split('\r\n');
      expect(csv.length, stem).toBeGreaterThanOrEqual(records.length + 1);
      expect(csv[0]?.split(',')[0], stem).toBe(Object.keys(records[0] ?? {})[0]);
      const sql = readFileSync(join(dir, `${stem}.sql`), 'utf8');
      expect(sql.match(/^INSERT INTO /gm)?.length, stem).toBe(records.length);
    }
  });

  it('names the SQL table for the dataset, or the list it belongs to', () => {
    expect(readFileSync(join(dir, 'users.sql'), 'utf8')).toContain('INSERT INTO "users"');
    expect(readFileSync(join(dir, 'users/1/orders.sql'), 'utf8')).toContain('INSERT INTO "orders"');
    expect(readFileSync(join(dir, 'ja/products.sql'), 'utf8')).toContain('INSERT INTO "products"');
    expect(readFileSync(join(dir, 'withdrawn.sql'), 'utf8')).toContain('INSERT INTO "withdrawn"');
  });

  it("is the API's own text: the same bytes as its format=csv, with the byte order mark Excel needs for Japanese", async () => {
    const live = new Uint8Array(
      await (await app.request('/products?seed=1&locale=ja&max=100&limit=10&offset=0&format=csv')).arrayBuffer(),
    );
    const written = new Uint8Array(readFileSync(join(dir, 'ja/products.csv')));
    expect(Array.from(written.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    expect(written).toEqual(live);
  });

  it('round-trips a Japanese page: parsing the CSV gives the records of the JSON', () => {
    const rows = parseCsv(readFileSync(join(dir, 'ja/users.csv'), 'utf8').replace(/^\uFEFF/, ''));
    const records = recordsOf('ja/users.json');
    expect(rows.length).toBe(records.length);
    const header = Object.keys(records[0] ?? {});
    expect(header).toContain('firstNameKana');
    rows.forEach((row, at) => {
      const record = records[at] ?? {};
      for (const [column, value] of Object.entries(row)) {
        const original = record[column];
        expect(value, `${column} of row ${at}`).toBe(
          original === null || original === undefined
            ? ''
            : typeof original === 'object'
              ? JSON.stringify(original)
              : String(original),
        );
      }
    });
    expect(rows[0]?.firstName).toMatch(/[\u3040-\u30ff\u4e00-\u9fff]/);
  });
});

/** A CSV as the API writes it (RFC 4180: quoted cells, doubled quotes, CRLF), as one object a row. */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i] as string;
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\r' && text[i + 1] === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i += 1;
    } else cell += char;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  const [header = [], ...body] = rows;
  return body.map((values) => Object.fromEntries(header.map((name, at) => [name, values[at] ?? ''])));
}

describe('the real reference data', () => {
  it("holds every subdivision and grouping, in the default locale only, and each country's own list", () => {
    const default_ = index.datasets[index.defaultLocale] ?? [];
    expect(default_.find((dataset) => dataset.name === 'subdivisions')).toMatchObject({
      records: 5050,
      pages: 505,
      idField: 'code',
      nested: [],
    });
    expect(default_.find((dataset) => dataset.name === 'groupings')?.records).toBe(107);
    expect(default_.find((dataset) => dataset.name === 'countries')?.records).toBe(250);
    expect(default_.find((dataset) => dataset.name === 'withdrawn')).toMatchObject({
      records: 31,
      nested: ['successors'],
    });
    const japanese = index.datasets.ja?.map((dataset) => dataset.name) ?? [];
    expect(japanese).not.toContain('countries');
    expect(japanese).toContain('products');
    expect(japanese).not.toContain('subdivisions');
    expect(japanese).not.toContain('groupings');
    const japan = read('countries/JP/subdivisions.json').results ?? [];
    expect(japan).toHaveLength(47);
    expect(read('subdivisions/JP-13.json').names).toEqual({ en: 'Tokyo', ja: '東京都' });
    expect(read('groupings/eu.json').memberCount).toBe(27);
    // The countries a withdrawn country led to are a list of countries, and /countries answers a bare array.
    expect(read('withdrawn/SUHH/successors.json')).toHaveLength(13);
    expect(files.has('subdivisions/JP-13/children.json')).toBe(false);
  });
});

describe('a build that cannot be right', () => {
  const answer = (routes: Record<string, () => Response>) => ({
    request: (path: string) => {
      const route = Object.entries(routes).find(([prefix]) => path.startsWith(prefix));
      return route ? route[1]() : new Response('{}', { status: 404 });
    },
  });
  const common = {
    '/health': () => Response.json({ version: '0.0.0' }),
    '/locales': () => Response.json([{ code: 'en-CA', default: true }, { code: 'ja' }]),
  };

  it('stops when the API reports no total, an id that is not a file name, or a missing locale', async () => {
    const resources = [{ name: 'things', idField: 'id', seeded: true, nested: [] }];
    const list = (id: unknown) => () =>
      Response.json(
        { metadata: { links: {}, parameters: {} }, results: [{ id }] },
        { headers: { 'X-Total-Count': '1' } },
      );
    const out = mkdtempSync(join(tmpdir(), 'rest-in-pieces-static-bad-'));
    try {
      await expect(
        writeStaticApi(
          answer({ ...common, '/resources': () => Response.json(resources), '/things?': () => Response.json({}) }),
          out,
          BASE,
        ),
      ).rejects.toThrow('X-Total-Count');
      await expect(
        writeStaticApi(
          answer({
            ...common,
            '/resources': () => Response.json(resources),
            '/things?': list('../x'),
            '/things/': list(1),
          }),
          out,
          BASE,
        ),
      ).rejects.toThrow('cannot be a file name');
      await expect(
        writeStaticApi(
          answer({
            ...common,
            '/resources': () => Response.json([]),
            '/locales': () => Response.json([{ code: 'en-CA', default: true }]),
          }),
          out,
          BASE,
        ),
      ).rejects.toThrow('/locales has no ja');
      await expect(
        writeStaticApi(
          answer({
            ...common,
            '/resources': () => Response.json([]),
            '/locales': () => Response.json([{ code: 'ja' }]),
          }),
          out,
          BASE,
        ),
      ).rejects.toThrow('no default locale');
      await expect(
        writeStaticApi(answer({ '/health': () => new Response('x', { status: 500 }) }), out, BASE),
      ).rejects.toThrow('/health returned 500');
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });
});
