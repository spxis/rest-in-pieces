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
import { CSV_BOM, toCsv, toNdjson, toSql } from '@johnmorrisdotca/rest-in-pieces/serialize';
import { DEFAULT_LOCALE_ONLY, FIXTURE_SEED } from './fixtures.ts';

/** How many records of each dataset the static API holds, which the API caps with `max`. */
export const STATIC_RECORDS = 100;
/** Records on a page; the API's default `limit`. */
export const STATIC_PAGE_SIZE = 10;
/** Locales written besides the default one, each in a folder of its own. */
export const STATIC_LOCALES: readonly string[] = ['ja'];
/**
 * Datasets the static API writes for the default locale only: those the fixtures leave out of other locales, and the
 * countries and withdrawn countries, whose records carry their names in English and Japanese (`names`) and whose `name` is
 * the only thing the locale changes. A Japanese copy of 250 countries and their nested lists would be 33 MB of files that
 * say the same; `?locale=ja` on the API gives it.
 */
export const STATIC_DEFAULT_LOCALE_ONLY: ReadonlySet<string> = new Set([
  ...DEFAULT_LOCALE_ONLY,
  'countries',
  'withdrawn',
]);
/** The JSONPlaceholder-shaped tree: its resources, and the lists each one owns. */
export const PLACEHOLDER_FOLDER = 'jsonplaceholder';
export const PLACEHOLDER_NESTED: Readonly<Record<string, readonly string[]>> = {
  users: ['posts', 'todos'],
  posts: ['comments'],
  comments: [],
  todos: [],
};
export const STATIC_INDEX_FILE = 'index.json';
/**
 * The formats written beside every `.json`, made by the API's own serializers (`?format=csv`, `ndjson`, `sql`): CSV with the
 * UTF-8 byte order mark the API writes, so Excel reads Japanese; one JSON record a line; and an `INSERT` for each record,
 * into a table named for the dataset. YAML and XML are the API's, not the files'.
 */
export const STATIC_FORMATS = ['csv', 'ndjson', 'sql'] as const;
/**
 * Lists a record owns that the static API does not write: a subdivision's `children` are the subdivisions whose `parent` it
 * is, and 5,050 files of them (most empty) would add nothing the country's own list (`countries/FR/subdivisions.json`) lacks.
 */
export const STATIC_SKIP_NESTED: Readonly<Record<string, readonly string[]>> = { subdivisions: ['children'] };

/** Where a dataset's routes are: `/users`, or the `path` the API gives (`/countries/withdrawn`). */
const route = (resource: { name: string; path?: string }): string => resource.path ?? `/${resource.name}`;

/** A file name made from a record id must be a plain word; anything else would need escaping in a URL. */
const SAFE_ID = /^[A-Za-z0-9_-]{1,40}$/;

interface FetchApp {
  request(path: string): Response | Promise<Response>;
}

interface ResourceInfo {
  name: string;
  /** Where the routes are (`/users`; `/countries/withdrawn` for the withdrawn countries). */
  path?: string;
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
  /** The formats every file is written in: `json`, and beside it `csv`, `ndjson` and `sql`. */
  formats: string[];
  /** Templates for the paths, `{dataset}`, `{page}`, `{id}`, `{list}` and `{format}` filled in. */
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
  const write = (path: string, text: string | Uint8Array) => {
    const target = join(dir, path);
    mkdirSync(join(target, '..'), { recursive: true });
    writeFileSync(target, text);
    files += 1;
  };
  const url = (path: string) => baseUrl + path;
  /** The same response as CSV, NDJSON and SQL, beside `stem.json`, byte for byte as the API writes it (the CSV's byte order mark too). */
  const writeFormats = async (stems: string[], request: string) => {
    for (const format of STATIC_FORMATS) {
      const bytes = new Uint8Array(
        await (await ok(app, `${request}${request.includes('?') ? '&' : '?'}format=${format}`)).arrayBuffer(),
      );
      for (const stem of stems) write(`${stem}.${format}`, bytes);
    }
  };

  const datasets: Record<string, StaticDataset[]> = {};
  const folders: Record<string, string> = { [defaultLocale]: '' };
  for (const code of STATIC_LOCALES) folders[code] = `${code}/`;

  for (const [code, folder] of Object.entries(folders)) {
    datasets[code] = [];
    for (const resource of resources) {
      if (code !== defaultLocale && STATIC_DEFAULT_LOCALE_ONLY.has(resource.name)) continue;
      // A seeded dataset is cut to its first records; real reference data (countries, regions) is whole, as it is small.
      const query = `${resource.seeded ? `seed=${FIXTURE_SEED}&` : ''}locale=${code}${resource.seeded ? `&max=${STATIC_RECORDS}` : ''}`;
      const name = resource.name;
      const pageFile = (page: number) => `${folder}${name}/page/${page}.json`;
      const first = await ok(app, `${route(resource)}?${query}&limit=${STATIC_PAGE_SIZE}&offset=0`);
      const total = Number(first.headers.get('X-Total-Count'));
      if (!Number.isInteger(total) || total < 1) throw new Error(`${name} has no X-Total-Count`);
      const records = resource.seeded ? Math.min(total, STATIC_RECORDS) : total;
      const pages = Math.ceil(records / STATIC_PAGE_SIZE);
      const held = (page: number) => (page >= 1 && page <= pages ? url(pageFile(page)) : null);
      const ids: string[] = [];
      const nestedHeld = resource.nested.filter((list) => !STATIC_SKIP_NESTED[name]?.includes(list));
      for (let page = 1; page <= pages; page += 1) {
        const response =
          page === 1
            ? first
            : await ok(
                app,
                `${route(resource)}?${query}&limit=${STATIC_PAGE_SIZE}&offset=${(page - 1) * STATIC_PAGE_SIZE}`,
              );
        const body = relink(await response.json(), held);
        for (const record of recordsOf(body)) ids.push(String(record[resource.idField]));
        const text = JSON.stringify(body);
        write(pageFile(page), text);
        if (page === 1) write(`${folder}${name}.json`, text);
        const pageStem = `${folder}${name}/page/${page}`;
        await writeFormats(
          page === 1 ? [pageStem, `${folder}${name}`] : [pageStem],
          `${route(resource)}?${query}&limit=${STATIC_PAGE_SIZE}&offset=${(page - 1) * STATIC_PAGE_SIZE}`,
        );
      }
      if (ids.length !== records) throw new Error(`${name} gave ${ids.length} records, not ${records}`);
      // A dataset may repeat an id (the country list repeats five codes); the API answers an id with its first record.
      for (const id of new Set(ids)) {
        if (!SAFE_ID.test(id)) throw new Error(`${name} has an id that cannot be a file name: ${id}`);
        write(`${folder}${name}/${id}.json`, await (await ok(app, `${route(resource)}/${id}?${query}`)).text());
        await writeFormats([`${folder}${name}/${id}`], `${route(resource)}/${id}?${query}`);
        for (const list of nestedHeld) {
          const response = await ok(app, `${route(resource)}/${id}/${list}?${query}&limit=1000`);
          const body = (await response.json()) as { metadata?: { total?: number } };
          const own = `${folder}${name}/${id}/${list}.json`;
          const count = recordsOf(body).length;
          if (count !== Number(body.metadata?.total ?? count)) throw new Error(`${own} is longer than one file holds`);
          write(own, JSON.stringify(relink(body, (page) => (page === 1 ? url(own) : null))));
          await writeFormats(
            [`${folder}${name}/${id}/${list}`],
            `${route(resource)}/${id}/${list}?${query}&limit=1000`,
          );
        }
      }
      datasets[code].push({ name, idField: resource.idField, records, pages, nested: nestedHeld });
    }
  }

  /**
   * The formats of a JSONPlaceholder list or record, written from the records as the JSON holds them, by the same functions:
   * the compat route reshapes only its JSON (users carry `name`, `address` and `company`), so asking it for CSV would
   * not give the records the JSON has.
   */
  const writeFormatsOf = (stem: string, records: readonly unknown[], table: string) => {
    write(`${stem}.csv`, `${CSV_BOM}${toCsv(records)}`);
    write(`${stem}.ndjson`, toNdjson(records));
    write(`${stem}.sql`, toSql(records, table));
  };

  // JSONPlaceholder's shapes: bare arrays as long as its own, and the nested lists its tutorials use.
  const lists: Record<string, number> = {};
  for (const [name, nested] of Object.entries(PLACEHOLDER_NESTED)) {
    const base = `/${PLACEHOLDER_FOLDER}/${name}`;
    const records = recordsOf(await json(app, base));
    lists[name] = records.length;
    write(`${PLACEHOLDER_FOLDER}/${name}.json`, JSON.stringify(records));
    writeFormatsOf(`${PLACEHOLDER_FOLDER}/${name}`, records, name);
    for (const record of records) {
      const id = String(record.id);
      if (!SAFE_ID.test(id)) throw new Error(`${name} has an id that cannot be a file name: ${id}`);
      const item = await (await ok(app, `${base}/${id}`)).text();
      write(`${PLACEHOLDER_FOLDER}/${name}/${id}.json`, item);
      writeFormatsOf(`${PLACEHOLDER_FOLDER}/${name}/${id}`, [JSON.parse(item)], name);
      for (const list of nested) {
        const body = recordsOf(await json(app, `${base}/${id}/${list}`));
        write(`${PLACEHOLDER_FOLDER}/${name}/${id}/${list}.json`, JSON.stringify(body));
        writeFormatsOf(`${PLACEHOLDER_FOLDER}/${name}/${id}/${list}`, body, list);
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
    formats: ['json', ...STATIC_FORMATS],
    paths: {
      list: '{dataset}.{format}',
      page: '{dataset}/page/{page}.{format}',
      item: '{dataset}/{id}.{format}',
      nested: '{dataset}/{id}/{list}.{format}',
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
