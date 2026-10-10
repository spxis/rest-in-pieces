/**
 * The static API: a small, linked, read-only copy of the API written to disk when the GitHub Pages site is built, so
 * a tutorial, a CodePen or a classroom can `fetch` real paths with no install, no key and no server. Pages cannot run a
 * query string, so a page number is in the path and every file ends in `.json`, which is also how Pages knows to
 * serve it as JSON.
 *
 * What is written, for a locale folder `` (the default locale) and `ja/`:
 *
 *   api/index.json                      what is here, and where
 *   api/users.json                      the first page of ten, in the API's own envelope
 *   api/users/page/2.json               page 2 of 10
 *   api/users/1.json                    one record
 *   api/users/1/orders.json             a record's nested list
 *   api/jsonplaceholder/posts.json      JSONPlaceholder's shapes and lengths, as bare arrays
 *   api/jsonplaceholder/posts/1/comments.json
 *
 * Everything is discovered from the API (`/resources`, `/locales`) and asked of it, so a new dataset gets its files with
 * no change here. `metadata.links` are rewritten to the files that answer them; the cursors, which need a running API,
 * are null. Each dataset holds its first `STATIC_RECORDS` records (the API's `max`), so a page the files do not hold is
 * never linked. Bigger copies are the fixtures; anything else is the API.
 */
import { mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { DEFAULT_LOCALE_ONLY, FIXTURE_SEED } from './fixtures.ts';

/** How many records of each dataset the static API holds, which the API caps with `max`. */
export const STATIC_RECORDS = 100;
/** Records on a page; the API's default `limit`. */
export const STATIC_PAGE_SIZE = 10;
/** Locales written besides the default one, each in a folder of its own. */
export const STATIC_LOCALES: readonly string[] = ['ja'];
/** The JSONPlaceholder-shaped tree: its resources, and the lists each one owns. */
export const PLACEHOLDER_FOLDER = 'jsonplaceholder';
export const PLACEHOLDER_NESTED: Readonly<Record<string, readonly string[]>> = {
  users: ['posts', 'todos'],
  posts: ['comments'],
  comments: [],
  todos: [],
};
export const STATIC_INDEX_FILE = 'index.json';

/** A file name made from a record id must be a plain word; anything else would need escaping in a URL. */
const SAFE_ID = /^[A-Za-z0-9_-]{1,40}$/;

interface FetchApp {
  request(path: string): Response | Promise<Response>;
}

interface ResourceInfo {
  name: string;
  idField: string;
  seeded: boolean;
  nested: string[];
}

interface LocaleInfo {
  code: string;
  default: boolean;
}

export interface StaticDataset {
  name: string;
  /** The field each record's file is named after. */
  idField: string;
  /** Records held, and pages of `pageSize` they make. */
  records: number;
  pages: number;
  /** The lists a record owns, each at `<dataset>/<id>/<list>.json`. */
  nested: string[];
}

export interface StaticApiIndex {
  version: string;
  seed: number;
  /** Where the files are served, ending in a slash. */
  base: string;
  pageSize: number;
  defaultLocale: string;
  /** Every locale folder: the default one is the root, written `''`. */
  folders: Record<string, string>;
  /** Templates for the paths, `{dataset}`, `{page}`, `{id}` and `{list}` filled in. */
  paths: { list: string; page: string; item: string; nested: string };
  datasets: Record<string, StaticDataset[]>;
  jsonplaceholder: { folder: string; lists: Record<string, number>; nested: Record<string, readonly string[]> };
  /** How many files the folder holds, `index.json` not counted. */
  files: number;
}

async function ok(app: FetchApp, path: string): Promise<Response> {
  const response = await app.request(path);
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  return response;
}

async function json<T>(app: FetchApp, path: string): Promise<T> {
  return (await (await ok(app, path)).json()) as T;
}

type Json = Record<string, unknown>;

/** A list response's records, whether it is an envelope or a bare array. */
function recordsOf(body: unknown): Json[] {
  if (Array.isArray(body)) return body as Json[];
  return ((body as { results?: Json[] }).results ?? []) as Json[];
}

/**
 * Points an envelope's `metadata.links` at the files, and drops its cursors. `file` turns a page number into the
 * file's address, or null when it is not held; a link the API wrote for a page the files do not hold becomes null.
 */
export function relink(body: unknown, file: (page: number) => string | null): unknown {
  if (Array.isArray(body) || !body || typeof body !== 'object') return body;
  const envelope = body as { metadata?: Json };
  const metadata = envelope.metadata;
  if (!metadata) return body;
  const links = (metadata.links ?? {}) as Record<string, string | null>;
  const size = Number((metadata.parameters as Json | undefined)?.size) || STATIC_PAGE_SIZE;
  const rewritten = Object.fromEntries(
    Object.entries(links).map(([name, link]) => {
      if (link === null || link === undefined) return [name, null];
      const offset = Number(new URL(link, 'http://api.test').searchParams.get('offset') ?? 0);
      return [name, file(Math.floor(offset / size) + 1)];
    }),
  );
  return { ...envelope, metadata: { ...metadata, links: rewritten, nextCursor: null, prevCursor: null } };
}

/**
 * Writes the static API into `dir` and returns its index. It adds files and removes none: `dir` is `api/` in the Pages
 * build, which also holds the OpenAPI document and the reference page. `baseUrl` is where `dir` will be served, ending
 * in a slash.
 */
export async function writeStaticApi(app: FetchApp, dir: string, baseUrl: string): Promise<StaticApiIndex> {
  const { version } = await json<{ version: string }>(app, '/health');
  const resources = await json<ResourceInfo[]>(app, '/resources');
  const locales = await json<LocaleInfo[]>(app, '/locales');
  const defaultLocale = locales.find((locale) => locale.default)?.code;
  if (!defaultLocale) throw new Error('/locales names no default locale');
  const known = new Set(locales.map((locale) => locale.code));
  for (const code of STATIC_LOCALES) if (!known.has(code)) throw new Error(`/locales has no ${code}`);

  let files = 0;
  const write = (path: string, text: string) => {
    const target = join(dir, path);
    mkdirSync(join(target, '..'), { recursive: true });
    writeFileSync(target, text);
    files += 1;
  };
  const url = (path: string) => baseUrl + path;

  const datasets: Record<string, StaticDataset[]> = {};
  const folders: Record<string, string> = { [defaultLocale]: '' };
  for (const code of STATIC_LOCALES) folders[code] = `${code}/`;

  for (const [code, folder] of Object.entries(folders)) {
    datasets[code] = [];
    for (const resource of resources) {
      if (code !== defaultLocale && DEFAULT_LOCALE_ONLY.has(resource.name)) continue;
      const query = `${resource.seeded ? `seed=${FIXTURE_SEED}&` : ''}locale=${code}&max=${STATIC_RECORDS}`;
      const name = resource.name;
      const pageFile = (page: number) => `${folder}${name}/page/${page}.json`;
      const first = await ok(app, `/${name}?${query}&limit=${STATIC_PAGE_SIZE}&offset=0`);
      const total = Number(first.headers.get('X-Total-Count'));
      if (!Number.isInteger(total) || total < 1) throw new Error(`${name} has no X-Total-Count`);
      const records = Math.min(total, STATIC_RECORDS);
      const pages = Math.ceil(records / STATIC_PAGE_SIZE);
      const held = (page: number) => (page >= 1 && page <= pages ? url(pageFile(page)) : null);
      const ids: string[] = [];
      for (let page = 1; page <= pages; page += 1) {
        const response =
          page === 1
            ? first
            : await ok(app, `/${name}?${query}&limit=${STATIC_PAGE_SIZE}&offset=${(page - 1) * STATIC_PAGE_SIZE}`);
        const body = relink(await response.json(), held);
        for (const record of recordsOf(body)) ids.push(String(record[resource.idField]));
        const text = JSON.stringify(body);
        write(pageFile(page), text);
        if (page === 1) write(`${folder}${name}.json`, text);
      }
      if (ids.length !== records) throw new Error(`${name} gave ${ids.length} records, not ${records}`);
      // A dataset may repeat an id (the country list repeats five codes); the API answers an id with its first record.
      for (const id of new Set(ids)) {
        if (!SAFE_ID.test(id)) throw new Error(`${name} has an id that cannot be a file name: ${id}`);
        write(`${folder}${name}/${id}.json`, await (await ok(app, `/${name}/${id}?${query}`)).text());
        for (const list of resource.nested) {
          const response = await ok(app, `/${name}/${id}/${list}?${query}&limit=1000`);
          const body = (await response.json()) as { metadata?: { total?: number } };
          const own = `${folder}${name}/${id}/${list}.json`;
          const count = recordsOf(body).length;
          if (count !== Number(body.metadata?.total ?? count)) throw new Error(`${own} is longer than one file holds`);
          write(own, JSON.stringify(relink(body, (page) => (page === 1 ? url(own) : null))));
        }
      }
      datasets[code].push({ name, idField: resource.idField, records, pages, nested: resource.nested });
    }
  }

  // JSONPlaceholder's shapes: bare arrays as long as its own, and the nested lists its tutorials use.
  const lists: Record<string, number> = {};
  for (const [name, nested] of Object.entries(PLACEHOLDER_NESTED)) {
    const base = `/${PLACEHOLDER_FOLDER}/${name}`;
    const records = recordsOf(await json(app, base));
    lists[name] = records.length;
    write(`${PLACEHOLDER_FOLDER}/${name}.json`, JSON.stringify(records));
    for (const record of records) {
      const id = String(record.id);
      if (!SAFE_ID.test(id)) throw new Error(`${name} has an id that cannot be a file name: ${id}`);
      write(`${PLACEHOLDER_FOLDER}/${name}/${id}.json`, await (await ok(app, `${base}/${id}`)).text());
      for (const list of nested) {
        const body = recordsOf(await json(app, `${base}/${id}/${list}`));
        write(`${PLACEHOLDER_FOLDER}/${name}/${id}/${list}.json`, JSON.stringify(body));
      }
    }
  }

  const index: StaticApiIndex = {
    version,
    seed: FIXTURE_SEED,
    base: baseUrl,
    pageSize: STATIC_PAGE_SIZE,
    defaultLocale,
    folders,
    paths: {
      list: '{dataset}.json',
      page: '{dataset}/page/{page}.json',
      item: '{dataset}/{id}.json',
      nested: '{dataset}/{id}/{list}.json',
    },
    datasets,
    jsonplaceholder: { folder: PLACEHOLDER_FOLDER, lists, nested: PLACEHOLDER_NESTED },
    files,
  };
  write(STATIC_INDEX_FILE, `${JSON.stringify(index, null, 2)}\n`);
  return index;
}

/** Every file under `dir`, as paths relative to it with `/` separators, sorted. */
export function staticFilesOnDisk(dir: string): string[] {
  const walk = (folder: string): string[] =>
    readdirSync(folder).flatMap((name) => {
      const path = join(folder, name);
      return statSync(path).isDirectory() ? walk(path) : [relative(dir, path).split(sep).join('/')];
    });
  return walk(dir).sort();
}
