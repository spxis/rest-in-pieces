/**
 * Static fixtures: responses from the API written to disk at build time, so GitHub Pages can serve plain URLs that
 * `curl`, a `<script>` or a tutorial can point at, with CORS and no server.
 *
 * Everything is discovered from the API itself (`/resources` and `/locales`), so a new dataset or locale gets its
 * fixtures with no change here. The default locale sits at the top of the folder, as it does in the API
 * (`users.json` answers `/users`); every other locale, `global` included, has a folder of its own (`ja/users.json`).
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** Seed 1 is the API's default, so the fixtures match a request that names no seed. */
export const FIXTURE_SEED = 1;
/** The size of the first page; also the API's default `limit`. */
export const PAGE_SIZE = 10;
/** Every record a dataset has: the API's largest `limit`. */
export const FULL_SIZE = 1000;
/** How many records each dataset and locale also gets in its item form (`users/1.json`). */
export const ITEM_COUNT = 3;
export const INDEX_FILE = 'index.json';

/** Where a dataset's routes are: `/users`, or the `path` the API gives (`/countries/withdrawn`). */
const route = (resource: { name: string; path?: string }): string => resource.path ?? `/${resource.name}`;

const FORMATS = ['json', 'csv'] as const;

/**
 * Datasets whose fixtures are written for the default locale only. The synthetic FHIR resources are large and what a
 * locale changes in them is a name and an address, and `/metrics` and `/logs` are the same series in every locale, so a
 * copy per locale would add tens of megabytes of files that say nothing new. The same goes for the 5,050 subdivisions and the 107 groupings, which hold their names in both languages. Every locale still answers them from the API.
 */
export const DEFAULT_LOCALE_ONLY: ReadonlySet<string> = new Set([
  'patients',
  'observations',
  'conditions',
  'encounters',
  'metrics',
  'logs',
  // Real reference data with both languages in every record (`names`): only `name` follows the locale.
  'subdivisions',
  'groupings',
  // Named features carry their names in both languages (`names`), and are cut at the API's largest page.
  'features',
  // An address's country, region and postcode do not follow the locale: they are in the seven countries' own formats.
  'addresses',
]);

interface FetchApp {
  request(path: string): Response | Promise<Response>;
}

export interface FixtureFile {
  /** Relative to the fixtures folder, e.g. `ja/users.page-1.csv`. */
  path: string;
  /** Where the file is served. */
  url: string;
  /** Size on disk, in bytes. */
  bytes: number;
  contentType: string;
  /** The API request this file is the response to, e.g. `/users?seed=1&locale=ja&limit=10&format=csv`. */
  request: string;
  dataset: string;
  locale: string;
  format: (typeof FORMATS)[number];
  /** `all` is every record, `page` the first page, `item` one record. */
  kind: 'all' | 'page' | 'item';
  /** Records in a list file; an item file is one record. */
  records?: number;
  /** The id of an item file. */
  id?: string;
}

export interface FixtureIndex {
  /** The API version that wrote the files. */
  version: string;
  seed: number;
  /** The locale at the top of the folder; every other one has a folder named after its code. */
  defaultLocale: string;
  files: FixtureFile[];
}

interface ResourceInfo {
  name: string;
  /** Where the routes are (`/users`; `/countries/withdrawn` for the withdrawn countries). */
  path?: string;
  idField: string;
  seeded: boolean;
}

interface LocaleInfo {
  code: string;
  default: boolean;
}

async function ok(app: FetchApp, path: string): Promise<Response> {
  const response = await app.request(path);
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  return response;
}

async function json<T>(app: FetchApp, path: string): Promise<T> {
  return (await (await ok(app, path)).json()) as T;
}

/** A list request's own records, whether the response is an envelope or a bare array. */
function recordsOf(body: unknown): Record<string, unknown>[] {
  if (Array.isArray(body)) return body;
  return ((body as { results?: Record<string, unknown>[] }).results ?? []) as Record<string, unknown>[];
}

/**
 * Writes every fixture and `index.json` into `dir`, replacing whatever was there, and returns the index.
 * `baseUrl` is where `dir` will be served, ending in a slash.
 */
export async function writeFixtures(app: FetchApp, dir: string, baseUrl: string): Promise<FixtureIndex> {
  rmSync(dir, { recursive: true, force: true });
  const { version } = await json<{ version: string }>(app, '/health');
  const resources = await json<ResourceInfo[]>(app, '/resources');
  const locales = await json<LocaleInfo[]>(app, '/locales');
  const defaultLocale = locales.find((locale) => locale.default)?.code;
  if (!defaultLocale) throw new Error('/locales names no default locale');

  const files: FixtureFile[] = [];
  const write = async (
    path: string,
    request: string,
    entry: Pick<FixtureFile, 'dataset' | 'locale' | 'format' | 'kind'> & { id?: string },
  ) => {
    const response = await ok(app, request);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const target = join(dir, path);
    mkdirSync(join(target, '..'), { recursive: true });
    writeFileSync(target, bytes);
    const total = Number(response.headers.get('X-Total-Count'));
    const records = entry.kind === 'item' ? undefined : Math.min(entry.kind === 'page' ? PAGE_SIZE : FULL_SIZE, total);
    files.push({
      path,
      url: baseUrl + path,
      bytes: bytes.byteLength,
      contentType: response.headers.get('Content-Type') ?? '',
      request,
      ...entry,
      ...(records === undefined ? {} : { records }),
    });
  };

  for (const locale of locales) {
    const folder = locale.code === defaultLocale ? '' : `${locale.code}/`;
    for (const resource of resources) {
      if (locale.code !== defaultLocale && DEFAULT_LOCALE_ONLY.has(resource.name)) continue;
      const query = `${resource.seeded ? `seed=${FIXTURE_SEED}&` : ''}locale=${locale.code}`;
      const about = { dataset: resource.name, locale: locale.code };
      for (const format of FORMATS) {
        const suffix = format === 'json' ? '' : `&format=${format}`;
        await write(`${folder}${resource.name}.${format}`, `${route(resource)}?${query}&limit=${FULL_SIZE}${suffix}`, {
          ...about,
          format,
          kind: 'all',
        });
        await write(
          `${folder}${resource.name}.page-1.${format}`,
          `${route(resource)}?${query}&limit=${PAGE_SIZE}${suffix}`,
          { ...about, format, kind: 'page' },
        );
      }
      // The ids are the first records' own, so they exist in every dataset, whatever its id field.
      const first = recordsOf(await json(app, `${route(resource)}?${query}&limit=${ITEM_COUNT}`));
      for (const record of first) {
        const id = String(record[resource.idField]);
        await write(`${folder}${resource.name}/${id}.json`, `${route(resource)}/${encodeURIComponent(id)}?${query}`, {
          ...about,
          format: 'json',
          kind: 'item',
          id,
        });
      }
    }
  }

  const index: FixtureIndex = { version, seed: FIXTURE_SEED, defaultLocale, files };
  writeFileSync(join(dir, INDEX_FILE), `${JSON.stringify(index, null, 2)}\n`);
  return index;
}

/** Every file under `dir` but the index, as paths relative to it with `/` separators, sorted. */
export function filesOnDisk(dir: string): string[] {
  const walk = (folder: string): string[] =>
    readdirSync(folder).flatMap((name) => {
      const path = join(folder, name);
      return statSync(path).isDirectory() ? walk(path) : [relative(dir, path).split(sep).join('/')];
    });
  return walk(dir)
    .filter((path) => path !== INDEX_FILE)
    .sort();
}

/**
 * Reads `index.json` back and checks it against the folder: every file listed exists at the size listed, and every
 * file in the folder is listed. Returns the problems found, none when they agree.
 */
export function checkFixtures(dir: string): string[] {
  const index = JSON.parse(readFileSync(join(dir, INDEX_FILE), 'utf8')) as FixtureIndex;
  const listed = new Map(index.files.map((file) => [file.path, file]));
  const onDisk = new Set(filesOnDisk(dir));
  const problems: string[] = [];
  if (listed.size !== index.files.length) problems.push('index.json lists a file twice');
  for (const [path, file] of listed) {
    if (!onDisk.has(path)) problems.push(`${path} is listed but missing`);
    else if (statSync(join(dir, path)).size !== file.bytes) problems.push(`${path} is not ${file.bytes} bytes`);
  }
  for (const path of onDisk) if (!listed.has(path)) problems.push(`${path} is not listed`);
  return problems;
}

/** The size of the whole folder, index included, in bytes. */
export function folderBytes(dir: string): number {
  return [...filesOnDisk(dir), INDEX_FILE].reduce((sum, path) => sum + statSync(join(dir, path)).size, 0);
}
