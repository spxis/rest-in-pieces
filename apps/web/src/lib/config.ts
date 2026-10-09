import type { PhraseKey } from '../i18n/phrases.ts';
import { IN_BROWSER, inBrowserBase } from './inBrowserApi.ts';

export type OutputFormat = 'json' | 'csv' | 'yaml' | 'xml';
export type SortType = 'string' | 'numeric';
export type SortDirection = 'asc' | 'desc';
export type FilterOperator = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte';

/** A data locale code, as `GET /locales` lists them: `en-CA`, `ja`, `global`. */
export type DataLocale = string;

/** What a locale code looks like. The API itself says which ones exist, and rejects the rest with a 400. */
const LOCALE_CODE = /^(global|[a-z]{2,3}(-[A-Z]{2})?)$/;

/** How the request names its page: `offset`, `page` and `pageSize`, or an opaque `cursor`. */
export type PagingStyle = 'offset' | 'page' | 'cursor';

export interface Field {
  id: number;
  name: string;
  type: string;
}

export interface Filter {
  id: number;
  field: string;
  operator: FilterOperator;
  value: string;
}

/** Everything the playground needs to rebuild a request. It round-trips through the URL hash for sharing. */
export interface PlaygroundConfig {
  /** A dataset name from `/resources`, or `generate`. */
  endpoint: string;
  apiBase: string;
  limit: number;
  /** The first record of the page. Page and cursor requests are built from it. */
  offset: number;
  paging: PagingStyle;
  max: number;
  seed: number;
  sortBy: string;
  sortType: SortType;
  sortDirection: SortDirection;
  q: string;
  filters: Filter[];
  format: OutputFormat;
  metadata: boolean;
  /** Milliseconds as typed: `1500`, a range such as `200-800`, or empty for none. See `normalizeDelay`. */
  delay: string;
  /** Milliseconds between the pieces of a trickled body, or 0 to send it whole. */
  trickle: number;
  /** A 4xx or 5xx status to simulate, or 0 for none. */
  status: number;
  /** Share of requests that fail: 0 (never) to 1 (always). */
  failRate: number;
  fields: Field[];
  /** The API's `locale`: which audience the generated data is written for. */
  locale: DataLocale;
}

export const FORMATS: readonly OutputFormat[] = ['json', 'csv', 'yaml', 'xml'];
export const OPERATORS: ReadonlyArray<{ value: FilterOperator; label: string }> = [
  { value: 'eq', label: '=' },
  { value: 'ne', label: '≠' },
  { value: 'gt', label: '>' },
  { value: 'gte', label: '≥' },
  { value: 'lt', label: '<' },
  { value: 'lte', label: '≤' },
];
export const PAGING_STYLES = [
  { value: 'offset', label: 'page.styleOffset' },
  { value: 'page', label: 'page.stylePage' },
  { value: 'cursor', label: 'page.styleCursor' },
] as const satisfies ReadonlyArray<{ value: PagingStyle; label: PhraseKey }>;
export const MAX_FIELDS = 50;
export const MAX_SEED = 4294967295;
/** The API's ceiling for `delay` and `trickle`, in milliseconds. */
export const MAX_DELAY_MS = 10_000;

/**
 * Reads a typed delay: `1500` or a range such as `200-800`, each 0 to 10000 and low to high.
 * Returns the value to send (`''` for no delay), or null when it does not validate.
 */
export function normalizeDelay(text: string): string | null {
  const match = text.replace(/\s+/g, '').match(/^(\d+)(?:-(\d+))?$/);
  if (!match) return text.trim() === '' ? '' : null;
  const low = Number(match[1]);
  const high = match[2] === undefined ? low : Number(match[2]);
  if (high > MAX_DELAY_MS || low > high) return null;
  if (high === 0) return '';
  return low === high ? String(low) : `${low}-${high}`;
}

export const DEFAULT_FIELDS: Field[] = [
  { id: 1, name: 'name', type: 'person.fullName' },
  { id: 2, name: 'email', type: 'internet.email' },
];

/**
 * Same origin in production (the API serves the playground), the local API during development,
 * and the API running inside the page on GitHub Pages.
 */
export function defaultApiBase(): string {
  if (IN_BROWSER) return inBrowserBase();
  const configured = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (configured) return configured;
  return import.meta.env.DEV ? 'http://localhost:6800' : window.location.origin;
}

export function defaultConfig(apiBase = defaultApiBase()): PlaygroundConfig {
  return {
    endpoint: 'names',
    apiBase,
    limit: 10,
    offset: 0,
    paging: 'offset',
    max: 1000,
    seed: 1,
    sortBy: '',
    sortType: 'string',
    sortDirection: 'asc',
    q: '',
    filters: [],
    format: 'json',
    metadata: true,
    delay: '',
    trickle: 0,
    status: 0,
    failRate: 0,
    fields: DEFAULT_FIELDS,
    locale: 'en-CA',
  };
}

function isField(value: unknown): value is Field {
  const v = value as Record<string, unknown>;
  return !!v && Number.isInteger(v.id) && typeof v.name === 'string' && typeof v.type === 'string';
}

function isFilter(value: unknown): value is Filter {
  const v = value as Record<string, unknown>;
  return (
    !!v &&
    Number.isInteger(v.id) &&
    typeof v.field === 'string' &&
    typeof v.value === 'string' &&
    OPERATORS.some((op) => op.value === v.operator)
  );
}

function parseList<T>(raw: string | null, guard: (value: unknown) => value is T, limit: number): T[] | null {
  if (!raw) return null;
  try {
    const decoded = JSON.parse(raw) as unknown;
    return Array.isArray(decoded) && decoded.length <= limit && decoded.every(guard) ? decoded : null;
  } catch {
    return null;
  }
}

/** Reads a shared setup from a URL hash, keeping only values that validate. */
export function configFromHash(hash: string, fallback = defaultConfig()): PlaygroundConfig {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const int = (key: string, value: number, min: number, max: number) => {
    const raw = params.get(key);
    if (raw === null || raw.trim() === '') return value;
    const parsed = Number(raw);
    return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : value;
  };
  const endpoint = params.get('endpoint');
  const format = params.get('format');
  const failRate = Number(params.get('failRate') ?? (params.get('fail') === 'true' ? 1 : 0));
  const legacyStatus = params.get('fail') === 'true' ? int('status', 500, 400, 599) : 0;
  const fields = parseList(params.get('fields'), isField, MAX_FIELDS);
  const delay = params.has('delay') ? normalizeDelay(params.get('delay') ?? '') : null;

  return {
    endpoint: endpoint && /^[a-z-]+$/.test(endpoint) ? endpoint : fallback.endpoint,
    apiBase: params.get('apiBase') || fallback.apiBase,
    limit: int('limit', fallback.limit, 0, 1000),
    offset: int('offset', fallback.offset, 0, 1_000_000),
    paging: PAGING_STYLES.find((style) => style.value === params.get('paging'))?.value ?? fallback.paging,
    max: int('max', fallback.max, 0, 1000),
    seed: int('seed', fallback.seed, 0, MAX_SEED),
    sortBy: params.get('sortBy') ?? fallback.sortBy,
    sortType: params.get('sortType') === 'numeric' ? 'numeric' : 'string',
    sortDirection: params.get('sortDirection') === 'desc' ? 'desc' : 'asc',
    q: params.get('q') ?? fallback.q,
    filters: parseList(params.get('filters'), isFilter, 20) ?? fallback.filters,
    format: FORMATS.includes(format as OutputFormat) ? (format as OutputFormat) : fallback.format,
    metadata: params.get('metadata') !== 'false',
    delay: delay ?? fallback.delay,
    trickle: int('trickle', fallback.trickle, 0, MAX_DELAY_MS),
    status: params.has('status') && !params.has('fail') ? int('status', 0, 0, 599) : legacyStatus,
    failRate: Number.isFinite(failRate) && failRate >= 0 && failRate <= 1 ? failRate : 0,
    fields: fields && fields.length > 0 ? fields : fallback.fields,
    locale: LOCALE_CODE.test(params.get('locale') ?? '') ? (params.get('locale') as DataLocale) : fallback.locale,
  };
}

/** Encodes a setup as a URL hash, leaving out anything still at its default. */
export function configToHash(config: PlaygroundConfig, defaults = defaultConfig()): string {
  const params = new URLSearchParams();
  for (const key of Object.keys(config) as Array<keyof PlaygroundConfig>) {
    const value = config[key];
    const fallback = defaults[key];
    if (JSON.stringify(value) === JSON.stringify(fallback) && key !== 'endpoint') continue;
    params.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
  }
  return params.toString();
}
