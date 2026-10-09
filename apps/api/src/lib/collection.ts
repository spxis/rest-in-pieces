import type { Context } from 'hono';
import pkg from '../../package.json' with { type: 'json' };
import { filterRecords, parseFilters } from './filter.ts';
import { DEFAULT_LOCALE, type Locale } from './locale.ts';
import { flagParam, intParam, paginate, pick, type Query } from './query.ts';
import { parseSort, type SortOptions, sortRecords } from './sort.ts';

export const MAX_RECORDS = 1000;
export const DEFAULT_RESULTS_NAME = 'results';

export interface CollectionDefaults {
  limit: number;
  metadata: boolean;
}

export interface ListOptions {
  limit: number;
  offset: number;
  max: number;
  sort: SortOptions;
  q: string | undefined;
  resultsName: string;
  showMetadata: boolean;
}

export function parseListOptions(query: Query, defaults: CollectionDefaults): ListOptions {
  const requestedName = pick(query, 'resultsName');
  return {
    limit: intParam(pick(query, 'limit', 'size', 'length'), defaults.limit, MAX_RECORDS),
    offset: intParam(pick(query, 'offset'), 0, MAX_RECORDS),
    max: intParam(pick(query, 'max', 'maxRecords'), MAX_RECORDS, MAX_RECORDS),
    sort: parseSort(
      pick(query, 'sortBy', 'sortby', 'sortField', 'sortfield'),
      pick(query, 'sortDirection', 'sortdirection', 'sortOrder', 'sortorder'),
    ),
    q: pick(query, 'q'),
    resultsName: requestedName && requestedName !== 'metadata' ? requestedName : DEFAULT_RESULTS_NAME,
    showMetadata: flagParam(pick(query, 'metadata'), defaults.metadata),
  };
}

export interface Page<T> {
  records: T[];
  total: number;
  options: ListOptions;
}

/**
 * The pipeline every collection shares: filter, sort, cap to `max`, then page.
 * Strings sort in the order of the dataset's `locale`.
 * `max` shrinks the dataset itself so clients can exercise their end-of-data handling.
 */
export function queryCollection<T extends object>(
  source: readonly T[],
  query: Query,
  defaults: CollectionDefaults,
  locale: Locale = DEFAULT_LOCALE,
) {
  const options = parseListOptions(query, defaults);
  const fields = new Set(source.length > 0 ? Object.keys(source[0] as object) : []);
  const filtered = filterRecords(source, parseFilters(query, fields), options.q);
  const dataset = sortRecords(filtered, options.sort, locale).slice(0, options.max);
  return { records: paginate(dataset, options.offset, options.limit), total: dataset.length, options };
}

function pageUrl(c: Context, offset: number, limit: number): string {
  const url = new URL(c.req.url);
  url.searchParams.delete('size');
  url.searchParams.delete('length');
  url.searchParams.set('offset', String(offset));
  url.searchParams.set('limit', String(limit));
  return `${url.pathname}${url.search}`;
}

export interface PageLinks {
  self: string;
  first: string;
  last: string;
  prev: string | null;
  next: string | null;
}

export function pageLinks(c: Context, { total, options: { offset, limit } }: Page<unknown>): PageLinks {
  const lastOffset = limit > 0 ? Math.max(0, Math.floor((total - 1) / limit) * limit) : 0;
  return {
    self: pageUrl(c, offset, limit),
    first: pageUrl(c, 0, limit),
    last: pageUrl(c, lastOffset, limit),
    prev: offset > 0 && limit > 0 ? pageUrl(c, Math.max(0, offset - limit), limit) : null,
    next: limit > 0 && offset + limit < total ? pageUrl(c, offset + limit, limit) : null,
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
        ...options.sort,
      },
      links,
    },
    [options.resultsName]: records,
  };
}
