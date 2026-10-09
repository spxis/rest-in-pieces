// @vitest-environment node
import { appendFileSync, mkdtempSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from 'rest-in-pieces/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  checkFixtures,
  type FixtureIndex,
  filesOnDisk,
  INDEX_FILE,
  ITEM_COUNT,
  PAGE_SIZE,
  writeFixtures,
} from './fixtures.ts';

const BASE = 'https://example.test/rest-in-pieces/fixtures/';
const app = createApp();
let dir = '';
let index: FixtureIndex;

async function get<T>(path: string): Promise<T> {
  return (await (await app.request(path)).json()) as T;
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'rest-in-pieces-fixtures-'));
  index = await writeFixtures(app, dir, BASE);
}, 120_000);

afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe('the static fixtures', () => {
  it('list every file on disk in index.json, at its size and URL, and nothing else', () => {
    expect(checkFixtures(dir)).toEqual([]);
    expect(index.files.map((file) => file.path).sort()).toEqual(filesOnDisk(dir));
    expect(JSON.parse(readFileSync(join(dir, INDEX_FILE), 'utf8'))).toEqual(index);
    for (const file of index.files) {
      expect(file.url).toBe(BASE + file.path);
      expect(statSync(join(dir, file.path)).size).toBe(file.bytes);
    }
  });

  it('cover every dataset in every locale, all records and the first page, in JSON and CSV', async () => {
    const resources = await get<{ name: string }[]>('/resources');
    const locales = await get<{ code: string; default: boolean }[]>('/locales');
    expect(locales.map((locale) => locale.code)).toContain('global');
    const paths = new Set(index.files.map((file) => file.path));
    for (const locale of locales) {
      const folder = locale.default ? '' : `${locale.code}/`;
      if (locale.default) expect(index.defaultLocale).toBe(locale.code);
      for (const { name } of resources) {
        for (const file of [`${name}.json`, `${name}.csv`, `${name}.page-1.json`, `${name}.page-1.csv`]) {
          expect(paths, folder + file).toContain(folder + file);
        }
        const items = index.files.filter((file) => file.kind === 'item' && file.dataset === name);
        expect(items.filter((file) => file.locale === locale.code)).toHaveLength(ITEM_COUNT);
      }
    }
    expect(index.files).toHaveLength(locales.length * resources.length * (4 + ITEM_COUNT));
  });

  it('hold the responses the API gives to the requests they name', async () => {
    const byPath = new Map(index.files.map((file) => [file.path, file]));
    // CSV and items carry no timestamp, so they match byte for byte.
    for (const path of ['users.csv', 'ja/names/0.json', 'global/countries/AD.json', 'de/products.page-1.csv']) {
      const file = byPath.get(path);
      if (!file) throw new Error(`${path} was not written`);
      const response = await app.request(file.request);
      expect(new Uint8Array(await response.arrayBuffer()), path).toEqual(new Uint8Array(readFileSync(join(dir, path))));
    }
    // A JSON list's metadata carries the time it was made; its records match.
    const page = byPath.get('global/products.page-1.json');
    if (!page) throw new Error('global/products.page-1.json was not written');
    const written = JSON.parse(readFileSync(join(dir, page.path), 'utf8')) as { results: unknown[] };
    expect(written.results).toHaveLength(PAGE_SIZE);
    expect(written.results).toEqual((await get<{ results: unknown[] }>(page.request)).results);
    expect(page.records).toBe(PAGE_SIZE);
    expect(byPath.get('users.json')?.records).toBe(1000);
  });

  // Runs last: it changes the folder.
  it('report a file missing, changed or not listed', () => {
    unlinkSync(join(dir, 'users.page-1.json'));
    appendFileSync(join(dir, 'ja/users.csv'), 'extra');
    writeFileSync(join(dir, 'stray.json'), '{}');
    expect(checkFixtures(dir)).toEqual([
      'users.page-1.json is listed but missing',
      `ja/users.csv is not ${index.files.find((file) => file.path === 'ja/users.csv')?.bytes} bytes`,
      'stray.json is not listed',
    ]);
  });
});
