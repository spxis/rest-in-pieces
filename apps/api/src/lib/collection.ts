import type { Context } from 'hono';
import pkg from '../../package.json' with { type: 'json' };
import { decodeCursor, encodeCursor, queryFingerprint } from './cursor.ts';
import { filterRecords, parseFilters } from './filter.ts';
import { DEFAULT_LOCALE, type Locale } from './locale.ts';
import { messyRecords, parseMessy } from './messy.ts';
import { flagParam, intParam, paginate, pick, type Query } from './query.ts';
import { parseSort, type SortOptions, sortRecords } from './sort.ts';

export const MAX_RECORDS = 1000;
export const DEFAULT_RESULTS_NAME = 'results';

export interface CollectionDefaults {
  limit: number;
  metadata: boolean;
}

/** How the request chose its page. Links in the response page the same way. */
export type PagingStyle = 'offset' | 'page' | 'cursor';

export interface ListOptions {
  limit: number;
  offset: number;
  paging: PagingStyle;
  /** Identifies the result set, so a cursor cannot be replayed against another one. */
  fingerprint: string;
  max: number;
  sort: SortOptions;
  q: string | undefined;
  resultsName: string;
  showMetadata: boolean;
  /** Share of values `messy` rewrites, or 0. */
  messy: number;
}

/**
 * Reads the page from `cursor`, then `page` (one-based, in pages of `limit`), then `offset`.
 * An empty `cursor=` starts a cursor walk on the first page. A cursor issued for a different query throws.
 */
function readPage(
  query: Query,
  limit: number,
  fingerprint: string,
  ceiling: number,
): { offset: number; paging: PagingStyle } {
  if (query.cursor !== undefined) {
    const offset = query.cursor === '' ? 0 : decodeCursor(query.cursor, fingerprint);
    return { offset: Math.min(offset, ceiling), paging: 'cursor' };
  }
  const page = pick(query, 'page');
  if (page !== undefined) {
    const number = Math.max(1, intParam(page, 1));
    return { offset: Math.min((number - 1) * limit, ceiling), paging: 'page' };
  }
  return { offset: intParam(pick(query, 'offset'), 0, ceiling), paging: 'offset' };
}

/**
 * Reads the paging, sorting and shaping parameters. `size` is how many records the dataset holds: 1000 for a
 * seeded one, more once a session has kept creates, and `max` and `offset` reach as far as it does.
 */
export function parseListOptions(query: Query, defaults: CollectionDefaults, size = MAX_RECORDS): ListOptions {
  const requestedName = pick(query, 'resultsName');
  const limit = intParam(pick(query, 'limit', 'size', 'length', 'pageSize'), defaults.limit, MAX_RECORDS);
  const fingerprint = queryFingerprint(query);
  const ceiling = Math.max(MAX_RECORDS, size);
  return {
    limit,
    ...readPage(query, limit, fingerprint, ceiling),
    fingerprint,
    max: intParam(pick(query, 'max', 'maxRecords'), ceiling, ceiling),
    sort: parseSort(
      pick(query, 'sortBy', 'sortby', 'sortField', 'sortfield'),
      pick(query, 'sortDirection', 'sortdirection', 'sortOrder', 'sortorder'),
    ),
    q: pick(query, 'q'),
    resultsName: requestedName && requestedName !== 'metadata' ? requestedName : DEFAULT_RESULTS_NAME,
    showMetadata: flagParam(pick(query, 'metadata'), defaults.metadata),
    messy: parseMessy(pick(query, 'messy')),
  };
}

export interface Page<T> {
  records: T[];
  total: number;
  options: ListOptions;
}

/** What `messy` needs besides its share: the dataset's seed and the fields it must leave alone. */
export interface MessyContext {
  seed: number;
  keep?: readonly string[];
  /** Each record's position in the whole dataset, when the collection is only part of it. */
  positions?: readonly number[];
}

/**
 * The pipeline every collection shares: make messy, filter, sort, cap to `max`, then page.
 * Strings sort in the order of the dataset's `locale`.
 * `max` shrinks the dataset itself so clients can exercise their end-of-data handling.
 * `messy` rewrites values before anything else, so filters, search and sort see what the client sees.
 */
export function queryCollection<T extends object>(
  clean: readonly T[],
  query: Query,
  defaults: CollectionDefaults,
  locale: Locale = DEFAULT_LOCALE,
  { seed, keep = [], positions }: MessyContext = { seed: 1 },
) {
  const options = parseListOptions(query, defaults, clean.length);
  const source = messyRecords(clean, { share: options.messy, seed, keep }, positions);
  // Every key any record has: a messy or mixed-locale record may lack one the first record has.
  const fields = new Set(source.flatMap((record) => Object.keys(record)));
  const filtered = filterRecords(source, parseFilters(query, fields), options.q);
  const dataset = sortRecords(filtered, options.sort, locale).slice(0, options.max);
  return { records: paginate(dataset, options.offset, options.limit), total: dataset.length, options };
}

function pageUrl(c: Context, offset: number, { limit, paging, fingerprint }: ListOptions): string {
  const url = new URL(c.req.url);
  for (const name of ['size', 'length', 'offset', 'page', 'pageSize', 'cursor']) url.searchParams.delete(name);
  if (paging === 'page') {
    url.searchParams.delete('limit');
    url.searchParams.set('page', String(limit > 0 ? Math.floor(offset / limit) + 1 : 1));
    url.searchParams.set('pageSize', String(limit));
  } else if (paging === 'cursor') {
    url.searchParams.set('cursor', encodeCursor(offset, fingerprint));
    url.searchParams.set('limit', String(limit));
  } else {
    url.searchParams.set('offset', String(offset));
    url.searchParams.set('limit', String(limit));
  }
  return `${url.pathname}${url.search}`;
}

/** Offsets of the neighbouring pages, or null at either end. */
function neighbours(total: number, { offset, limit }: ListOptions) {
  return {
    prev: offset > 0 && limit > 0 ? Math.max(0, offset - limit) : null,
    next: limit > 0 && offset + limit < total ? offset + limit : null,
  };
}

export interface PageLinks {
  self: string;
  first: string;
  last: string;
  prev: string | null;
  next: string | null;
}

export function pageLinks(c: Context, { total, options }: Page<unknown>): PageLinks {
  const { offset, limit } = options;
  const lastOffset = limit > 0 ? Math.max(0, Math.floor((total - 1) / limit) * limit) : 0;
  const { prev, next } = neighbours(total, options);
  return {
    self: pageUrl(c, offset, options),
    first: pageUrl(c, 0, options),
    last: pageUrl(c, lastOffset, options),
    prev: prev === null ? null : pageUrl(c, prev, options),
    next: next === null ? null : pageUrl(c, next, options),
  };
}

/** Cursors for the neighbouring pages. Every response carries them, so a cursor walk can start from any page. */
export function pageCursors({ total, options }: Page<unknown>) {
  const { prev, next } = neighbours(total, options);
  return {
    nextCursor: next === null ? null : encodeCursor(next, options.fingerprint),
    prevCursor: prev === null ? null : encodeCursor(prev, options.fingerprint),
  };
}

/** Sets `X-Total-Count` and an RFC 8288 `Link` header so clients can page without reading the body. */
export function setPaginationHeaders(c: Context, links: PageLinks, total: number) {
  c.header('X-Total-Count', String(total));
  const relations = (['first', 'prev', 'next', 'last'] as const)
    .filter((rel) => links[rel])
    .map((rel) => `<${links[rel]}>; rel="${rel}"`);
  c.header('Link', relations.join(', '));
}

export interface EnvelopeMeta {
  generatedAt: Date;
  seed: number | null;
  locale: string;
}

/** Builds the response body: the legacy metadata envelope, or the bare page when `metadata=false`. */
export function buildBody<T>(page: Page<T>, links: PageLinks, meta: EnvelopeMeta): unknown {
  const { records, total, options } = page;
  if (!options.showMetadata) return records;
  return {
    metadata: {
      count: records.length,
      total,
      timestamp: String(meta.generatedAt.getTime()),
      lastUpdated: meta.generatedAt.toISOString(),
      output: { results: options.resultsName },
      version: pkg.version,
      parameters: {
        size: options.limit,
        offset: options.offset,
        max: options.max,
        seed: meta.seed,
        locale: meta.locale,
        q: options.q ?? null,
        messy: options.messy || null,
        ...options.sort,
      },
      links,
      ...pageCursors(page),
    },
    [options.resultsName]: records,
  };
}
