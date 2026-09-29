import type { PhraseKey } from '../i18n/phrases.ts';

export type OutputFormat = 'json' | 'csv' | 'yaml' | 'xml';
export type SortType = 'string' | 'numeric';
export type SortDirection = 'asc' | 'desc';
export type FilterOperator = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte';

export type DataLocale = 'en-CA' | 'ja';

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
  offset: number;
  max: number;
  seed: number;
  sortBy: string;
  sortType: SortType;
  sortDirection: SortDirection;
  q: string;
  filters: Filter[];
  format: OutputFormat;
  metadata: boolean;
  delay: number;
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
export const DATA_LOCALES = [
  { value: 'en-CA', label: 'data.localeEn' },
  { value: 'ja', label: 'data.localeJa' },
] as const satisfies ReadonlyArray<{ value: DataLocale; label: PhraseKey }>;
export const MAX_FIELDS = 50;
export const MAX_SEED = 4294967295;

export const DEFAULT_FIELDS: Field[] = [
  { id: 1, name: 'name', type: 'person.fullName' },
  { id: 2, name: 'email', type: 'internet.email' },
];

/** Same origin in production (the API serves the playground); the local API during development. */
export function defaultApiBase(): string {
  const configured = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (configured) return configured;
  return import.meta.env.DEV ? 'http://localhost:8080' : window.location.origin;
}

export function defaultConfig(apiBase = defaultApiBase()): PlaygroundConfig {
  return {
    endpoint: 'names',
    apiBase,
    limit: 10,
    offset: 0,
    max: 1000,
    seed: 1,
    sortBy: '',
    sortType: 'string',
    sortDirection: 'asc',
    q: '',
    filters: [],
    format: 'json',
    metadata: true,
    delay: 0,
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

  return {
    endpoint: endpoint && /^[a-z-]+$/.test(endpoint) ? endpoint : fallback.endpoint,
    apiBase: params.get('apiBase') || fallback.apiBase,
    limit: int('limit', fallback.limit, 0, 1000),
    offset: int('offset', fallback.offset, 0, 1_000_000),
    max: int('max', fallback.max, 0, 1000),
    seed: int('seed', fallback.seed, 0, MAX_SEED),
    sortBy: params.get('sortBy') ?? fallback.sortBy,
    sortType: params.get('sortType') === 'numeric' ? 'numeric' : 'string',
    sortDirection: params.get('sortDirection') === 'desc' ? 'desc' : 'asc',
    q: params.get('q') ?? fallback.q,
    filters: parseList(params.get('filters'), isFilter, 20) ?? fallback.filters,
    format: FORMATS.includes(format as OutputFormat) ? (format as OutputFormat) : fallback.format,
    metadata: params.get('metadata') !== 'false',
    delay: int('delay', fallback.delay, 0, 10_000),
    status: params.has('status') && !params.has('fail') ? int('status', 0, 0, 599) : legacyStatus,
    failRate: Number.isFinite(failRate) && failRate >= 0 && failRate <= 1 ? failRate : 0,
    fields: fields && fields.length > 0 ? fields : fallback.fields,
    locale: DATA_LOCALES.some((option) => option.value === params.get('locale'))
      ? (params.get('locale') as DataLocale)
      : fallback.locale,
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
