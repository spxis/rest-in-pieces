/**
 * Mocks an API from its OpenAPI (3.x) or Swagger (2.0) document: every operation answers with seeded data that matches
 * the schema of its response, requests are checked against the document, and the usual `delay`, `status`, `fail` and
 * `trickle` controls work on every route.
 *
 * What is made. A request is matched to an operation by method and path (`/pets/{petId}`, the most specific first). Its
 * path, query and header parameters and its JSON body are checked against the document, and a request that does not fit
 * is answered `400` (or `422`, when that is what the document lists) with every problem named. The answer is the
 * operation's lowest `2xx` response, made from its schema by the same generator `POST /generate` uses, seeded from the
 * seed, the method and the address, so the same request gives the same body on every machine and `/pets/1` and `/pets/2`
 * differ. A list is as long as the `limit` (or `pageSize`, `per_page`…) the operation declares, ten when none is asked.
 *
 * What is not. There is no store: a `POST` is answered, not kept, though the fields it sent are echoed into the answer.
 * Filters and sorts are checked, not applied. Only JSON bodies are made, and `pattern` is not checked on requests, since
 * a pattern from a document is never run as a regular expression. Security schemes are not enforced.
 *
 * Bounded like the schema generator: `readSpec` limits the document (`SPEC_LIMITS`), `prepareSchemaIn` every schema in it
 * (`SCHEMA_LIMITS`), a response `MOCK_LIMITS`, and a request body is at most 64 KB. A `$ref` anywhere must be local.
 * Nothing here imports a Node module, so it runs in a worker or a browser as it does in Node.
 */
import { Scalar } from '@scalar/hono-api-reference';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { build, hash } from '../data/build.ts';
import type { GenerateContext } from '../data/generators.ts';
import { chooseDelay, MAX_DELAY_MS, parseStatus, REASONS, requestKey, shouldFail, trickle } from './controls.ts';
import { startOfToday } from './expression.ts';
import { JsonSchemaError, type PreparedSchema, prepareSchemaIn } from './jsonschema.ts';
import { type CountryLocale, parseLocale, UnsupportedLocaleError } from './locale.ts';
import { OpenApiError, type Operation, type ParamSpec, type ResponseSpec, readSpec } from './openapiSpec.ts';
import { flagParam, intParam } from './query.ts';
import { publicBase } from './safe.ts';
import { declaredTypes, type Violation, validateValue } from './schemaValidate.ts';

export { OpenApiError } from './openapiSpec.ts';

export const MOCK_LIMITS = {
  /** The most items a list holds, whatever `limit` asks. */
  items: 100,
  /** Items in a list the request does not size. */
  defaultItems: 10,
  /** Values one response may hold. */
  nodes: 5000,
  /** Characters one response may take as JSON. */
  chars: 1_000_000,
  /** The largest request body. */
  body: 64 * 1024,
} as const;

/** The query names that mean "how many", checked in this order against what an operation declares. */
export const LIMIT_NAMES = [
  'limit',
  'pageSize',
  'page_size',
  'per_page',
  'perPage',
  'size',
  'count',
  'take',
  'maxResults',
  'max_results',
] as const;

/** Query parameters that change how a request is answered, not what it asks. `_name` always works for each. */
export const CONTROLS = ['delay', 'trickle', 'status', 'fail', 'seed', 'locale', 'safe'] as const;

/** Properties that usually hold a response's list, when a response has more than one array. */
const LIST_NAMES = ['data', 'items', 'results', 'content', 'records', 'rows', 'list'];

export interface MockOptions {
  /** The seed when a request names none. Default 1. */
  seed?: number;
  /** Serve safe values (example-domain emails and URLs, fiction-range phones…) unless a request says `safe=false`. */
  safe?: boolean;
  /** Log each request. */
  log?: boolean;
  /** Where the interactive docs page fetches the document from. Default `/__mock/openapi.json`. */
  specUrl?: string;
}

export interface MockOperationInfo {
  method: string;
  path: string;
  operationId?: string;
  summary?: string;
  /** The status a request with no control is answered with; none when the operation cannot be answered. */
  status?: number;
  /** Every status the document lists. */
  statuses: string[];
  parameters: Array<{ name: string; in: string; required: boolean }>;
  body: { required: boolean; json: boolean } | null;
}

export interface Mock {
  app: Hono;
  operations: MockOperationInfo[];
  title: string;
  version: string;
}

interface PreparedResponse {
  spec: ResponseSpec;
  prepared: PreparedSchema | undefined;
  /** Where a list lives in the value: `''` for the value itself, `/data` for a property. */
  listAt: string | undefined;
  /** The properties the schema names, which a request's fields are echoed into even when this body left one out. */
  props: ReadonlySet<string>;
}

interface Route {
  op: Operation;
  responses: PreparedResponse[];
  success: PreparedResponse | undefined;
  /** The query parameters the operation declares, which are its own whatever the controls are called. */
  declared: Set<string>;
  limitName: string | undefined;
}

type Node = { [key: string]: unknown };
const isNode = (value: unknown): value is Node => typeof value === 'object' && value !== null && !Array.isArray(value);

const KEY = (op: Operation) => `${op.method.toUpperCase()} ${op.template}`;

/** The first response a request with no control is answered with: 200, else the lowest 2xx, else `2XX`, else `default`. */
export function pickSuccess(responses: readonly ResponseSpec[]): ResponseSpec | undefined {
  const exact = responses.filter((response) => /^2\d\d$/.test(response.key));
  const lowest = exact.sort((a, b) => a.status - b.status)[0];
  return (
    lowest ?? responses.find((response) => /^2XX$/i.test(response.key)) ?? responses.find((r) => r.key === 'default')
  );
}

/** The response a status is declared as, by its own key, then its range, then `default`. */
function declaredFor(responses: readonly PreparedResponse[], status: number): PreparedResponse | undefined {
  return (
    responses.find((response) => response.spec.key === String(status)) ??
    responses.find((response) => response.spec.key.toUpperCase() === `${String(status)[0]}XX`) ??
    responses.find((response) => response.spec.key === 'default')
  );
}

/** The properties of a schema, following `$ref` and `allOf`; what a response is made of, for finding its list. */
function propertiesOf(document: unknown, schema: unknown, hops = 0): Node {
  if (!isNode(schema) || hops > 8) return {};
  if (typeof schema.$ref === 'string') {
    try {
      let at: unknown = document;
      for (const part of schema.$ref.slice(2).split('/')) {
        at = (at as Node)[decodeURIComponent(part).replaceAll('~1', '/').replaceAll('~0', '~')];
      }
      return propertiesOf(document, at, hops + 1);
    } catch {
      return {};
    }
  }
  const merged: Node = isNode(schema.properties) ? { ...schema.properties } : {};
  if (Array.isArray(schema.allOf))
    for (const part of schema.allOf) Object.assign(merged, propertiesOf(document, part, hops + 1));
  return merged;
}

/** Follows `$ref` to a node that says what it is. */
function shapeOf(document: unknown, schema: unknown): Node | undefined {
  let at = schema;
  for (let hops = 0; isNode(at) && typeof at.$ref === 'string' && hops < 8; hops++) {
    try {
      let next: unknown = document;
      for (const part of at.$ref.slice(2).split('/')) next = (next as Node)[decodeURIComponent(part)];
      at = next;
    } catch {
      return undefined;
    }
  }
  return isNode(at) ? at : undefined;
}

const isList = (document: unknown, schema: unknown): boolean => {
  const node = shapeOf(document, schema);
  return node !== undefined && (node.type === 'array' || (node.type === undefined && node.items !== undefined));
};

/** Where the list is in a response: the response itself when it is an array, else its one (or best named) array property. */
function listPath(document: unknown, schema: unknown): string | undefined {
  if (schema === undefined) return undefined;
  if (isList(document, schema)) return '';
  const lists = Object.entries(propertiesOf(document, shapeOf(document, schema))).filter(([, property]) =>
    isList(document, property),
  );
  const named = lists.find(([name]) => LIST_NAMES.includes(name));
  const chosen = named ?? (lists.length === 1 ? lists[0] : undefined);
  return chosen ? `/${chosen[0]}` : undefined;
}

const problemsText = (operation: string, where: string, error: unknown): string =>
  `${operation} (${where}): ${error instanceof Error ? error.message : 'cannot be mocked'}`;

/**
 * One value from a prepared schema, in a locale, from a seed: what every body is made by, and what start-up tries once
 * for every response so a schema that cannot be made is found before a request is. A list is `count` items long.
 */
function makeValue(
  prepared: PreparedSchema,
  seed: number,
  locale: ReturnType<typeof parseLocale>,
  context: GenerateContext,
  listAt: string | undefined,
  count: number = MOCK_LIMITS.defaultItems,
): unknown {
  const lengths = listAt === undefined ? undefined : new Map([[listAt, count]]);
  const reference = startOfToday();
  return build(
    {
      default: (info: CountryLocale) => {
        info.faker.setDefaultRefDate(reference);
        try {
          return prepared.make(info, context, {
            nodes: MOCK_LIMITS.nodes,
            chars: MOCK_LIMITS.chars,
            lengths,
            maxItems: MOCK_LIMITS.items,
          }).value;
        } finally {
          info.faker.setDefaultRefDate();
        }
      },
    },
    1,
    seed,
    locale,
  )[0];
}

/**
 * One example value for a schema in a document, seeded: what a request body in a generated Postman or Bruno collection
 * is made of. Throws `JsonSchemaError` for a schema the generator cannot make.
 */
export function sampleValue(document: unknown, schema: unknown, seed = 1): unknown {
  const prepared = prepareSchemaIn(document, schema);
  return makeValue(prepared, seed, 'en-CA', { safe: true, base: 'http://localhost:6800' }, undefined);
}

/** Prepares every response schema of every operation, or throws `OpenApiError` naming each one that cannot be made. */
function prepareRoutes(operations: readonly Operation[], document: unknown): Route[] {
  const problems: string[] = [];
  const routes = operations.map((op): Route => {
    const responses = op.responses.map((spec): PreparedResponse => {
      let prepared: PreparedSchema | undefined;
      if (spec.json && spec.schema !== undefined) {
        try {
          prepared = prepareSchemaIn(document, spec.schema);
        } catch (error) {
          if (!(error instanceof JsonSchemaError)) throw error;
          problems.push(problemsText(KEY(op), `the ${spec.key} response`, error));
        }
      }
      const listAt = prepared ? listPath(document, spec.schema) : undefined;
      if (prepared) {
        // Made once now, so a schema that can never be made (a loop through required properties) is found at start-up.
        try {
          makeValue(prepared, 1, 'en-CA', { safe: false, base: '' }, listAt);
        } catch (error) {
          if (!(error instanceof JsonSchemaError)) throw error;
          problems.push(problemsText(KEY(op), `the ${spec.key} response`, error));
        }
      }
      const props = new Set(Object.keys(propertiesOf(document, shapeOf(document, spec.schema))));
      return { spec, prepared, listAt, props };
    });
    const declared = new Set(op.params.filter((param) => param.in === 'query').map((param) => param.name));
    const success = pickSuccess(op.responses);
    return {
      op,
      responses,
      success: responses.find((response) => response.spec === success),
      declared,
      limitName: LIMIT_NAMES.find((name) => declared.has(name)),
    };
  });
  if (problems.length > 0) {
    throw new OpenApiError(
      `${problems.slice(0, 10).join('\n')}${problems.length > 10 ? `\n…and ${problems.length - 10} more.` : ''}`,
    );
  }
  return routes;
}

function describe(route: Route): MockOperationInfo {
  const { op } = route;
  return {
    method: op.method.toUpperCase(),
    path: op.template,
    ...(op.operationId ? { operationId: op.operationId } : {}),
    ...(op.summary ? { summary: op.summary } : {}),
    ...(route.success ? { status: route.success.spec.status } : {}),
    statuses: op.responses.map((response) => response.key),
    parameters: op.params.map(({ name, in: where, required }) => ({ name, in: where, required })),
    body: op.body ? { required: op.body.required, json: op.body.json } : null,
  };
}

interface Problem {
  in: 'path' | 'query' | 'header' | 'body';
  name?: string;
  path?: string;
  message: string;
}

const named = (location: Problem['in'], name: string, violations: Violation[]): Problem[] =>
  violations.map((violation) => ({
    in: location,
    name,
    ...(violation.path ? { path: violation.path } : {}),
    message: violation.message,
  }));

/** Checks one declared parameter against the request. */
function checkParam(document: unknown, param: ParamSpec, raw: string[] | undefined): Problem[] {
  if (raw === undefined || raw.length === 0) {
    return param.required ? [{ in: param.in as Problem['in'], name: param.name, message: 'is required' }] : [];
  }
  if (param.schema === undefined) return [];
  const types = declaredTypes(document, param.schema);
  let value: unknown = raw[0];
  if (types.includes('array')) {
    const parts = raw.length > 1 || param.explode ? raw : (raw[0] as string).split(',');
    value = parts.slice(0, MOCK_LIMITS.items * 10);
  }
  return named(param.in as Problem['in'], param.name, validateValue(document, param.schema, value, { coerce: true }));
}

/** The success body with the fields the request sent put into it, so a `POST` answers with what it was given. */
function echo(made: unknown, body: unknown, pathValues: Record<string, unknown>, props: ReadonlySet<string>): unknown {
  if (!isNode(made)) return made;
  const out: Node = { ...made };
  const known = (name: string) => Object.hasOwn(out, name) || props.has(name);
  if (isNode(body)) for (const [name, value] of Object.entries(body)) if (known(name)) out[name] = value;
  for (const [name, value] of Object.entries(pathValues)) {
    if (known(name)) out[name] = value;
    else if (/id$/i.test(name) && Object.hasOwn(out, 'id') && typeof out.id === typeof value) out.id = value;
  }
  return out;
}

/** Builds the mock: its Hono app, and the operations it answers. Throws `OpenApiError` for a document it cannot mock. */
export function createMock(input: unknown, options: MockOptions = {}): Mock {
  const spec = readSpec(input);
  const routes = prepareRoutes(spec.operations, spec.document);
  const defaultSeed = options.seed ?? 1;
  const app = new Hono();

  if (options.log) app.use('*', logger());
  app.use('*', secureHeaders({ crossOriginResourcePolicy: 'cross-origin' }));
  app.use(
    '*',
    cors({
      origin: '*',
      allowHeaders: ['*'],
      exposeHeaders: ['X-Simulated', 'X-Mock-Operation', 'Retry-After', 'Location', 'ETag', 'Link'],
    }),
  );

  const operations = routes.map(describe);
  app.get('/__mock', (c) =>
    c.json({
      title: spec.title,
      version: spec.version,
      operations,
      controls: Object.fromEntries(
        CONTROLS.map((name) => [
          name,
          `?${name}=…, or ?_${name}=… when an operation declares a ${name} parameter itself`,
        ]),
      ),
    }),
  );
  app.get('/__mock/openapi.json', (c) => c.json(spec.document));
  app.get(
    '/__mock/docs',
    Scalar({ url: options.specUrl ?? '/__mock/openapi.json', pageTitle: `${spec.title} (mock)` }),
  );

  app.use(
    '*',
    bodyLimit({
      maxSize: MOCK_LIMITS.body,
      onError: (c) =>
        c.json({ error: `The request body is larger than ${MOCK_LIMITS.body / 1024} KB.`, status: 413 }, 413),
    }),
  );

  const stripBase = (path: string): string => {
    if (spec.basePath && (path === spec.basePath || path.startsWith(`${spec.basePath}/`))) {
      return path.slice(spec.basePath.length) || '/';
    }
    return path;
  };

  app.all('*', async (c) => {
    const url = new URL(c.req.url);
    const method = c.req.method === 'HEAD' ? 'get' : c.req.method.toLowerCase();
    const path = stripBase(url.pathname);

    const matching = routes.filter((route) => route.op.pattern.test(path));
    if (matching.length === 0) {
      return c.json(
        { error: 'Not Found', status: 404, hint: 'GET /__mock lists the operations that are mocked.' },
        404,
      );
    }
    const route = matching.find((candidate) => candidate.op.method === method);
    if (!route) {
      c.header('Allow', [...new Set(matching.map((candidate) => candidate.op.method.toUpperCase()))].join(', '));
      return c.json({ error: 'Method Not Allowed', status: 405 }, 405);
    }
    const { op } = route;
    c.header('X-Mock-Operation', KEY(op));

    // A control is read from `name`, or `_name`; an operation that declares `name` itself keeps it for itself.
    const control = (name: string): string | undefined => {
      const alias = url.searchParams.get(`_${name}`);
      if (route.declared.has(name)) return alias === null || alias === '' ? undefined : alias;
      const own = url.searchParams.get(name);
      return own !== null && own !== '' ? own : alias === null || alias === '' ? undefined : alias;
    };

    const delay = chooseDelay(control('delay'), requestKey(c.req.url, url.pathname));
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    const gap = intParam(control('trickle'), 0, MAX_DELAY_MS);
    const slowly = (res: Response) => trickle(res, gap, MAX_DELAY_MS - delay);

    const wanted = parseStatus(control('status'));
    const failing = shouldFail(control('fail'), Math.random) || (wanted !== null && wanted >= 400);
    if (failing) {
      const code = wanted !== null && wanted >= 400 ? wanted : 500;
      const listed = declaredFor(route.responses, code);
      c.header('X-Simulated', 'true');
      if (code === 429 || code === 503) c.header('Retry-After', '1');
      return slowly(
        await answer(
          c.req.raw,
          route,
          listed,
          code,
          { simulated: true },
          { seed: defaultSeed, url, control, values: {} },
        ),
      );
    }

    // Path parameters.
    const match = op.pattern.exec(path);
    const problems: Problem[] = [];
    const pathValues: Record<string, unknown> = {};
    for (const [index, name] of op.pathNames.entries()) {
      let value: string;
      try {
        value = decodeURIComponent(match?.[index + 1] ?? '');
      } catch {
        problems.push({ in: 'path', name, message: 'is not valid text' });
        continue;
      }
      const param = op.params.find((candidate) => candidate.in === 'path' && candidate.name === name);
      if (param) problems.push(...checkParam(spec.document, param, [value]));
      pathValues[name] = param?.schema === undefined ? value : coerce(spec.document, param.schema, value);
    }
    for (const param of op.params) {
      if (param.in === 'query') problems.push(...checkParam(spec.document, param, queryValues(url, param.name)));
      else if (param.in === 'header') {
        const raw = c.req.header(param.name);
        problems.push(...checkParam(spec.document, param, raw === undefined ? undefined : [raw]));
      }
    }

    // The body.
    let body: unknown;
    if (op.body && method !== 'get' && method !== 'head') {
      const text = await c.req.text();
      const type = c.req.header('content-type') ?? '';
      if (text.trim() === '') {
        if (op.body.required) problems.push({ in: 'body', message: 'is required' });
      } else if (op.body.json) {
        if (type !== '' && !/json/i.test(type)) {
          return c.json(
            { error: 'Unsupported Media Type', status: 415, hint: 'Send the body as application/json.' },
            415,
          );
        }
        try {
          body = JSON.parse(text);
        } catch {
          return c.json({ error: 'The request body is not valid JSON.', status: 400 }, 400);
        }
        if (op.body.schema !== undefined) {
          for (const violation of validateValue(spec.document, op.body.schema, body, { request: true })) {
            problems.push({
              in: 'body',
              ...(violation.path ? { path: violation.path } : {}),
              message: violation.message,
            });
          }
        }
      }
    }
    if (problems.length > 0) {
      // 422 when that is what the document lists for a bad request and 400 is not.
      const code = !declaredExact(route, 400) && declaredExact(route, 422) ? 422 : 400;
      return slowly(
        c.json(
          {
            error: 'The request does not match the OpenAPI document.',
            status: code,
            errors: problems.slice(0, 50),
          },
          code as ContentfulStatusCode,
        ),
      );
    }

    const success = route.success;
    if (!success)
      return slowly(new Response(null, { status: wanted ?? 200, headers: { 'X-Mock-Operation': KEY(op) } }));
    // A 2xx the request asks for is answered from the response the document lists for it, when it lists one.
    const chosen = (wanted !== null && declaredFor(route.responses, wanted)) || success;
    return slowly(
      await answer(
        c.req.raw,
        route,
        chosen,
        wanted ?? chosen.spec.status,
        { head: c.req.method === 'HEAD' },
        {
          seed: defaultSeed,
          url,
          control,
          values: pathValues,
          body,
        },
      ),
    );
  });

  /** Makes one response: a status, a body from the schema the document gives it, and the headers it lists. */
  async function answer(
    request: Request,
    route: Route,
    listed: PreparedResponse | undefined,
    status: number,
    flags: { simulated?: boolean; head?: boolean },
    context: {
      seed: number;
      url: URL;
      control: (name: string) => string | undefined;
      values: Record<string, unknown>;
      body?: unknown;
    },
  ): Promise<Response> {
    const headers = new Headers({ 'X-Mock-Operation': KEY(route.op) });
    if (flags.simulated) headers.set('X-Simulated', 'true');
    if (flags.simulated && (status === 429 || status === 503)) headers.set('Retry-After', '1');
    const bodyless = status === 204 || status === 205 || status === 304;

    if (!listed?.prepared) {
      // Nothing to make a body from: a failure gets the project's own error body, and an answer with no schema is empty.
      if (flags.simulated) {
        return Response.json(
          { error: REASONS[status] ?? 'Simulated error', status, simulated: true },
          { status, headers },
        );
      }
      if (listed && !listed.spec.json && listed.spec.contentTypes.length > 0 && !bodyless) {
        return Response.json(
          {
            error: `This response is ${listed.spec.contentTypes.join(', ')}, and the mock makes only JSON bodies.`,
            status: 501,
          },
          { status: 501, headers },
        );
      }
      if (listed?.spec.json && !bodyless) {
        headers.set('Content-Type', `${listed.spec.mediaType.split(';')[0]}; charset=UTF-8`);
        return new Response(flags.head ? null : '{}', { status, headers });
      }
      return new Response(null, { status, headers });
    }

    const { searchParams } = context.url;
    const asked = route.limitName ? searchParams.get(route.limitName) : null;
    const requested = asked === '' ? null : asked;
    const declaredLimit = route.limitName
      ? route.op.params.find((param) => param.in === 'query' && param.name === route.limitName)
      : undefined;
    const fallback =
      isNode(declaredLimit?.schema) && typeof declaredLimit.schema.default === 'number'
        ? declaredLimit.schema.default
        : MOCK_LIMITS.defaultItems;
    const count = Math.min(requested === null ? fallback : intParam(requested, fallback), MOCK_LIMITS.items);

    // The same request, the same body: seeded from the seed, the operation and every parameter that is not a count.
    const seedText = context.control('seed');
    const seed =
      seedText !== undefined && /^\d+$/.test(seedText) ? Math.min(Number(seedText), 2 ** 32 - 1) : context.seed;
    const identity = [
      seed,
      route.op.method,
      route.op.template,
      status,
      ...Object.entries(context.values).map(([name, value]) => `${name}=${String(value)}`),
      ...[...route.declared]
        .filter((name) => name !== route.limitName)
        .map((name) => `${name}=${searchParams.getAll(name).join(',')}`),
    ].join('|');

    let locale: ReturnType<typeof parseLocale>;
    try {
      locale = parseLocale(context.control('locale'));
    } catch (error) {
      if (error instanceof UnsupportedLocaleError)
        return Response.json({ error: error.message, status: 400 }, { status: 400 });
      throw error;
    }
    const safe = flagParam(context.control('safe'), options.safe ?? false);
    const origin = publicBase(request.url, request.headers.get('x-forwarded-prefix') ?? undefined);

    const prepared = listed.prepared;
    let value: unknown;
    try {
      value = makeValue(prepared, hash(identity), locale, { safe, base: safe ? origin : '' }, listed.listAt, count);
    } catch (error) {
      if (!(error instanceof JsonSchemaError)) throw error;
      return Response.json({ error: error.message, status: 500, operation: KEY(route.op) }, { status: 500, headers });
    }
    if (!flags.simulated && status < 300) value = echo(value, context.body, context.values, listed.props);

    for (const [name, schema] of Object.entries(listed.spec.headers)) {
      if (/^(content-type|content-length)$/i.test(name) || schema === undefined) continue;
      try {
        const header = build(
          {
            default: (info: CountryLocale) =>
              prepareSchemaIn(spec.document, schema).make(info, { safe, base: '' }).value,
          },
          1,
          hash(`${identity}|${name}`),
          locale,
        )[0];
        if (typeof header === 'string' || typeof header === 'number' || typeof header === 'boolean') {
          headers.set(name, String(header));
        }
      } catch {
        // A header the generator cannot make is left off.
      }
    }
    if (bodyless) return new Response(null, { status, headers });
    headers.set('Content-Type', `${listed.spec.mediaType.split(';')[0]}; charset=UTF-8`);
    return new Response(flags.head ? null : JSON.stringify(value), { status, headers });
  }

  return { app, operations, title: spec.title, version: spec.version };
}

function declaredExact(route: Route, status: number): boolean {
  return route.responses.some((response) => response.spec.key === String(status));
}

function queryValues(url: URL, name: string): string[] | undefined {
  const values = url.searchParams.getAll(name);
  return values.length === 0 ? undefined : values;
}

function coerce(document: unknown, schema: unknown, text: string): unknown {
  const types = declaredTypes(document, schema);
  if (types.includes('integer') && /^-?\d+$/.test(text)) return Number(text);
  if (types.includes('number') && /^-?\d+(\.\d+)?$/.test(text)) return Number(text);
  return text;
}

/** The Hono app alone, for `app.request()` and `app.fetch`. */
export function createMockApp(document: unknown, options?: MockOptions): Hono {
  return createMock(document, options).app;
}
