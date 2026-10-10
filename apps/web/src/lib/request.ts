import { encodeCursor, queryFingerprint } from '@johnmorrisdotca/rest-in-pieces/cursor';
import {
  DEFAULT_MESSY_SHARE,
  type HttpMethod,
  normalizeDelay,
  type OutputFormat,
  type PlaygroundConfig,
  takesBody,
  takesId,
} from './config.ts';

export const trimBase = (base: string) => base.trim().replace(/\/+$/, '');

export function mimeFor(format: OutputFormat): string {
  return {
    json: 'application/json',
    csv: 'text/csv',
    yaml: 'application/yaml',
    xml: 'application/xml',
    ndjson: 'application/x-ndjson',
    sql: 'application/sql',
  }[format];
}

/** The query the API reads: the first value of each parameter. */
function firstValues(params: URLSearchParams): Record<string, string> {
  const query: Record<string, string> = {};
  for (const [key, value] of params) query[key] ??= value;
  return query;
}

/** The parameters that name the page, in the setup's paging style. A cursor is built for the rest of the query. */
function pagingParams({ paging, limit, offset }: PlaygroundConfig, rest: URLSearchParams): URLSearchParams {
  const params = new URLSearchParams();
  if (paging === 'page') {
    params.set('page', String(limit > 0 ? Math.floor(offset / limit) + 1 : 1));
    params.set('pageSize', String(limit));
    return params;
  }
  params.set('limit', String(limit));
  if (paging === 'cursor') {
    // An empty cursor asks for the first page with cursor links; later pages carry the API's own cursor format.
    params.set('cursor', offset > 0 ? encodeCursor(offset, queryFingerprint(firstValues(rest))) : '');
  } else if (offset > 0) {
    params.set('offset', String(offset));
  }
  return params;
}

/** The simulation parameters, and `auth`, shared by reads and writes. */
function simulationParams(config: PlaygroundConfig, params: URLSearchParams): void {
  if (config.auth) params.set('auth', config.auth);
  const delay = normalizeDelay(config.delay);
  if (delay) params.set('delay', delay);
  if (config.trickle > 0) params.set('trickle', String(config.trickle));
  if (config.status >= 400) params.set('status', String(config.status));
  else if (config.failRate > 0) params.set('fail', config.failRate >= 1 ? 'true' : String(config.failRate));
}

/**
 * A write's URL: the collection for `POST`, the record for the others. Paging, filters and format do not apply;
 * `seed` and `locale` choose the record a `PUT`, `PATCH` or `DELETE` names.
 */
function buildWriteUrl(config: PlaygroundConfig, seeded: boolean): string {
  const params = new URLSearchParams();
  const named = takesId(config.method);
  if (named && seeded && config.seed !== 1) params.set('seed', String(config.seed));
  if (named && config.locale !== 'en-CA') params.set('locale', config.locale);
  if (config.conflict) params.set('conflict', 'true');
  simulationParams(config, params);
  const path = named ? `/${encodeURIComponent(config.recordId.trim())}` : '';
  const query = params.toString();
  return `${trimBase(config.apiBase)}/${datasetPath(config.endpoint)}${path}${query ? `?${query}` : ''}`;
}

/** The path a read asks for: the dataset, or a list under one of its records (`/users/7/orders`). */
export function readPath(config: Pick<PlaygroundConfig, 'endpoint' | 'nested' | 'parentId'>): string {
  if (!config.nested || config.endpoint === 'generate') return `/${datasetPath(config.endpoint)}`;
  return `/${datasetPath(config.endpoint)}/${encodeURIComponent(config.parentId.trim() || '1')}/${config.nested}`;
}

/** Whether the setup generates from a schema: a `POST /generate` whose paging, sorting and format still ride in the query. */
export const isSchemaRequest = (config: Pick<PlaygroundConfig, 'endpoint' | 'schemaMode'>) =>
  config.endpoint === 'generate' && config.schemaMode;

/** The properties a typed schema lists, for the sort and filter pickers; none when it does not parse. */
export function schemaProperties(text: string): string[] {
  try {
    const parsed = JSON.parse(text) as unknown;
    const shape = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    const root =
      shape.openapi !== undefined || shape.swagger !== undefined
        ? (shape.components as { schemas?: Record<string, { properties?: object }> } | undefined)?.schemas
        : undefined;
    const properties = root ? Object.values(root)[0]?.properties : (shape.properties as object | undefined);
    return properties && typeof properties === 'object' ? Object.keys(properties) : [];
  } catch {
    return [];
  }
}

/**
 * The JSON body a schema request sends: the typed schema as `schema`, or as `openapi` with its `component` when it is an
 * OpenAPI document, with the dataset size and seed. `''` when the text is not a JSON object.
 */
export function schemaBody(config: Pick<PlaygroundConfig, 'schema' | 'component' | 'max' | 'seed'>): string {
  try {
    const parsed = JSON.parse(config.schema) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return '';
    const document = parsed as Record<string, unknown>;
    const isDocument = document.openapi !== undefined || document.swagger !== undefined;
    const component = config.component.trim();
    return JSON.stringify({
      ...(isDocument ? { openapi: document, ...(component ? { component } : {}) } : { schema: document }),
      count: Math.max(1, config.max),
      seed: config.seed,
    });
  } catch {
    return '';
  }
}

/** The method and body a setup sends, whatever the controls show: a schema request is always a `POST`. */
export function requestFor(config: PlaygroundConfig): { method: HttpMethod; body: string } {
  return isSchemaRequest(config)
    ? { method: 'POST', body: schemaBody(config) }
    : { method: config.method, body: config.body };
}

/**
 * The `rest-in-pieces generate` command that writes this setup's records offline, or null when the setup is not a
 * generated one. A schema is typed in the playground, so the command reads it from `schema.json`.
 */
export function generateCommand(config: PlaygroundConfig): string | null {
  if (config.endpoint !== 'generate') return null;
  const quote = (text: string) => `'${text.replaceAll("'", "'\\''")}'`;
  const schema = isSchemaRequest(config);
  const format = (['ndjson', 'json', 'csv', 'sql'] as const).find((name) => name === config.format) ?? 'ndjson';
  const parts = ['npx @johnmorrisdotca/rest-in-pieces generate'];
  if (schema) {
    parts.push('--schema schema.json');
    if (config.component.trim() && /"(openapi|swagger)"\s*:/.test(config.schema)) {
      parts.push(`--component ${quote(config.component.trim())}`);
    }
  } else {
    parts.push(
      `--fields ${quote(config.fields.map((field) => `${field.name.trim()}:${field.type.trim()}`).join(','))}`,
    );
    if (config.constraints.trim()) parts.push(`--constraints ${quote(config.constraints.trim())}`);
  }
  parts.push(`--count ${Math.max(1, config.max)}`, `--seed ${config.seed}`);
  if (config.locale !== 'en-CA') parts.push(`--locale ${config.locale}`);
  if (config.safe) parts.push('--safe');
  parts.push(`--format ${format}`);
  if (format === 'sql') parts.push(`--table ${config.table.trim() || 'generated'}`);
  // One option to a line, so the command reads in a narrow panel and pastes as it is.
  const command = parts.join(' \\\n  ');
  return schema ? `# Save the schema above as schema.json\n${command}` : command;
}

/** Datasets whose routes are not at `/{name}`: the withdrawn countries are a list inside `/countries`. */
const DATASET_PATHS: Readonly<Record<string, string>> = { withdrawn: 'countries/withdrawn' };

/** The path segment a dataset is served at, without the leading slash. */
export const datasetPath = (endpoint: string): string => DATASET_PATHS[endpoint] ?? endpoint;

/** Builds the request URL for a setup. Parameters at their API defaults are left out to keep URLs readable. */
export function buildRequestUrl(config: PlaygroundConfig, seeded = true): string {
  const schema = isSchemaRequest(config);
  if (config.method !== 'GET' && !schema) return buildWriteUrl(config, seeded);
  const params = new URLSearchParams();
  // A schema request carries its size and seed in the body.
  if (seeded && config.seed !== 1 && !schema) params.set('seed', String(config.seed));
  if (config.max < 1000 && !schema) params.set('max', String(config.max));
  if (config.sortBy) {
    params.set('sortBy', `${config.sortBy}${config.sortType === 'numeric' ? ':numeric' : ''}`);
    if (config.sortDirection === 'desc') params.set('sortDirection', 'desc');
  }
  if (config.q.trim()) params.set('q', config.q.trim());
  for (const filter of config.filters) {
    if (!filter.field || filter.value.trim() === '') continue;
    params.append(filter.operator === 'eq' ? filter.field : `${filter.field}[${filter.operator}]`, filter.value.trim());
  }
  // Countries return a bare array unless the envelope is requested; everything else is the reverse.
  if (config.endpoint === 'countries' ? config.metadata : !config.metadata) {
    params.set('metadata', String(config.metadata));
  }
  if (config.endpoint === 'generate' && !schema) {
    params.set('fields', config.fields.map((field) => `${field.name.trim()}:${field.type.trim()}`).join(','));
    if (config.constraints.trim()) params.set('constraints', config.constraints.trim());
  }
  if (config.expand.length > 0 && config.endpoint !== 'generate') params.set('expand', config.expand.join(','));
  if (config.safe) params.set('safe', 'true');
  if (config.locale !== 'en-CA') params.set('locale', config.locale);
  if (config.messy > 0) params.set('messy', config.messy === DEFAULT_MESSY_SHARE ? 'true' : String(config.messy));
  if (config.format !== 'json') params.set('format', config.format);
  if (config.format === 'sql' && config.table.trim()) params.set('table', config.table.trim());
  simulationParams(config, params);
  return `${trimBase(config.apiBase)}${readPath(config)}?${pagingParams(config, params)}&${params}`.replace(/&$/, '');
}

const shellQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

/** What a request sends besides its URL. A GET sends nothing. */
export interface SendOptions {
  method: HttpMethod;
  /** The JSON body, as typed. Only `POST`, `PUT` and `PATCH` send one. */
  body?: string;
  /** Snippets send `Authorization: Bearer` with a token from `POST /auth/login`, named `TOKEN`. */
  bearer?: boolean;
}

/** The body as one line when it is valid JSON, or as typed when it is not. */
export function compactJson(body: string): string {
  try {
    return JSON.stringify(JSON.parse(body));
  } catch {
    return body;
  }
}

/** Writes always answer JSON, whatever format the reads were set to. */
/** The header a snippet sends once signed in, as source: `token` is the snippet's own variable. */
// biome-ignore lint/suspicious/noTemplateCurlyInString: this is source text for a snippet, not a template here
export const BEARER_HEADER = 'Authorization: `Bearer ${token}`';

export const acceptFor = (format: OutputFormat, method: HttpMethod) => mimeFor(method === 'GET' ? format : 'json');

export function curlCommand(
  url: string,
  format: OutputFormat,
  { method, body, bearer }: SendOptions = { method: 'GET' },
): string {
  const parts = ['curl -i'];
  if (method !== 'GET') parts.push(`-X ${method}`);
  parts.push(`-H ${shellQuote(`Accept: ${acceptFor(format, method)}`)}`);
  // Double quotes, so the shell fills in the token.
  if (bearer) parts.push('-H "Authorization: Bearer $TOKEN"');
  if (takesBody(method)) {
    parts.push(`-H ${shellQuote('Content-Type: application/json')}`, `-d ${shellQuote(compactJson(body ?? ''))}`);
  }
  parts.push(shellQuote(url));
  return parts.join(' ');
}

export function fetchSnippet(
  url: string,
  format: OutputFormat,
  { method, body, bearer }: SendOptions = { method: 'GET' },
): string {
  const accept = JSON.stringify(acceptFor(format, method));
  const sendsBody = takesBody(method);
  const auth = bearer ? `, ${BEARER_HEADER}` : '';
  const read =
    method === 'DELETE'
      ? 'const deleted = response.status === 204;'
      : `const data = await response.${method !== 'GET' || format === 'json' ? 'json' : 'text'}();`;
  return [
    `const response = await fetch(${JSON.stringify(url)}, {`,
    ...(method === 'GET' ? [] : [`  method: '${method}',`]),
    sendsBody
      ? `  headers: { Accept: ${accept}, 'Content-Type': 'application/json'${auth} },`
      : `  headers: { Accept: ${accept}${auth} },`,
    ...(sendsBody ? [`  body: ${bodyExpression(body ?? '')},`] : []),
    '});',
    read,
  ].join('\n');
}

/** `JSON.stringify({...})` for a valid body, so the snippet reads as code; the typed text as a string otherwise. */
export function bodyExpression(body: string): string {
  try {
    return `JSON.stringify(${JSON.stringify(JSON.parse(body))})`;
  } catch {
    return JSON.stringify(body);
  }
}

export function isLocalApi(base: string): boolean | null {
  try {
    const { hostname } = new URL(base);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  } catch {
    return null;
  }
}

/** Finds the array of records in a response body, whether enveloped or bare. */
export function extractRows(body: unknown): Array<Record<string, unknown>> | null {
  const rows = Array.isArray(body)
    ? body
    : body && typeof body === 'object' && 'metadata' in body
      ? (body as Record<string, unknown>)[
          ((body as { metadata?: { output?: { results?: string } } }).metadata?.output?.results ?? 'results') as string
        ]
      : body && typeof body === 'object'
        ? [body]
        : null;
  return Array.isArray(rows) && rows.every((row) => row && typeof row === 'object' && !Array.isArray(row))
    ? (rows as Array<Record<string, unknown>>)
    : null;
}

/** The streams the API plays, by the dataset each one is. */
export const STREAM_NAMES = ['messages', 'notifications', 'metrics', 'logs'] as const;
export type StreamName = (typeof STREAM_NAMES)[number];

/** The most events the playground asks one stream for, and the API's own ceiling. */
export const MAX_STREAM_EVENTS = 500;
/** The API's floor and ceiling for the time between events, in milliseconds. */
export const STREAM_EVERY = { min: 100, max: 10_000 } as const;

export interface StreamSetup {
  stream: StreamName;
  count: number;
  every: number;
  /** Close the connection after this many events, to rehearse a reconnect; 0 never. */
  drop: number;
  seed: number;
  locale: string;
}

/** `GET /streams/{name}` with what the setup asks for; parameters left at the API's own defaults are left off. */
export function buildStreamUrl(base: string, setup: StreamSetup): string {
  const params = new URLSearchParams({ count: String(setup.count), every: String(setup.every) });
  if (setup.seed !== 1) params.set('seed', String(setup.seed));
  if (setup.locale !== 'en-CA') params.set('locale', setup.locale);
  if (setup.drop > 0) params.set('drop', String(setup.drop));
  return `${trimBase(base)}/streams/${setup.stream}?${params}`;
}

/** What a page of the reader's own would write to listen, as `EventSource` and as `curl`. */
export function streamSnippets(url: string): { javascript: string; curl: string } {
  return {
    javascript: `const source = new EventSource('${url}');\nsource.onmessage = (event) => console.log(JSON.parse(event.data));\nsource.addEventListener('end', () => source.close());`,
    curl: `curl -N '${url}'`,
  };
}
