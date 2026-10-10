// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '@johnmorrisdotca/rest-in-pieces/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE_ONLY } from './fixtures.ts';
import {
  PLACEHOLDER_NESTED,
  relink,
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
      expect(file.endsWith('.json'), file).toBe(true);
      expect(() => read(file), file).not.toThrow();
    }
  });

  it('holds the first hundred records of every seeded dataset, and every record of the real ones, in pages of ten, in the default locale and Japanese', async () => {
    const resources = (await (await app.request('/resources')).json()) as { name: string; seeded: boolean }[];
    expect(Object.keys(index.datasets)).toEqual([index.defaultLocale, ...STATIC_LOCALES]);
    for (const [locale, datasets] of Object.entries(index.datasets)) {
      const folder = index.folders[locale];
      const expected = resources.filter(({ name }) => locale === index.defaultLocale || !DEFAULT_LOCALE_ONLY.has(name));
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
    for (const file of files) {
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
      expect(statSync(join(dir, file)).size, file).toBeLessThan(400_000);
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
