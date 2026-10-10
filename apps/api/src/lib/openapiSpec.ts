/**
 * Reads the OpenAPI (3.x) or Swagger (2.0) document of an API you want to mock into a table of operations: for each
 * method and path, what it takes (parameters and a body), how it answers (status codes with a schema or none) and the
 * pattern that matches its address. It holds no data and answers nothing; `openapiMock.ts` does that from this table.
 *
 * A document is read as untrusted input, so it is bounded and nothing it names is fetched: at most
 * `SPEC_LIMITS.operations` operations, `SPEC_LIMITS.nodes` values, and a `$ref` anywhere in it must point inside the
 * same document (`#/…`). A path such as `/pets/{petId}/photos.{ext}` becomes a pattern built from escaped literals and
 * `[^/]+`, never from text of the document, so no path can make a match run away.
 */
import { JsonSchemaError, pointer } from './jsonschema.ts';

/** A document that cannot be mocked. Its message says where and why, so it can be shown as it is. */
export class OpenApiError extends Error {}

export const SPEC_LIMITS = {
  /** Operations, counting each method of each path. */
  operations: 1000,
  /** Values anywhere in the document. */
  nodes: 500_000,
  /** The longest path template. */
  path: 500,
  /** `$ref` hops one reference chain may take. */
  refs: 32,
} as const;

export const METHODS = ['get', 'put', 'post', 'delete', 'patch', 'head', 'options'] as const;
export type Method = (typeof METHODS)[number];
export type ParamLocation = 'path' | 'query' | 'header' | 'cookie';

type Node = { [key: string]: unknown };
const isNode = (value: unknown): value is Node => typeof value === 'object' && value !== null && !Array.isArray(value);

export interface ParamSpec {
  name: string;
  in: ParamLocation;
  required: boolean;
  /** The schema the value is checked against; none when the document gives none. */
  schema: unknown;
  /** A query list as `a=1&a=2` (the default) rather than `a=1,2`. */
  explode: boolean;
}

export interface BodySpec {
  required: boolean;
  /** The JSON schema of the body; none when the body is not JSON or has no schema. */
  schema: unknown;
  json: boolean;
  contentTypes: string[];
}

export interface ResponseSpec {
  /** `200`, `404`, `2XX` or `default`, as the document writes it. */
  key: string;
  /** The status a request is answered with: the key as a number, `200` for `2XX` and `default`. */
  status: number;
  description: string;
  /** The JSON schema of the body; none for a response with no body, or none given. */
  schema: unknown;
  json: boolean;
  /** The JSON media type the document names, such as `application/problem+json`. */
  mediaType: string;
  contentTypes: string[];
  headers: Record<string, unknown>;
}

export interface Operation {
  method: Method;
  /** The path as the document writes it: `/pets/{petId}`. */
  template: string;
  pattern: RegExp;
  /** The path parameters, in the order they appear in the template. */
  pathNames: string[];
  params: ParamSpec[];
  body: BodySpec | undefined;
  responses: ResponseSpec[];
  operationId: string | undefined;
  summary: string | undefined;
  /** Segments that are not parameters: more of them match first, so `/pets/mine` beats `/pets/{id}`. */
  literal: number;
}

export interface ReadSpec {
  document: Node;
  title: string;
  version: string;
  operations: Operation[];
  /** The path every operation is served under as well as at the root; empty when the document names none. */
  basePath: string;
}

const escapeLiteral = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Everything wrong that can be found by looking, so a document with a $ref to a file is refused before anything is read. */
function scan(document: unknown): void {
  const seen = new WeakSet<object>();
  const stack: Array<[unknown, string]> = [[document, '#']];
  let nodes = 0;
  while (stack.length > 0) {
    const [node, at] = stack.pop() as [unknown, string];
    if (++nodes > SPEC_LIMITS.nodes) {
      throw new OpenApiError(`The document has more than ${SPEC_LIMITS.nodes.toLocaleString('en-US')} values.`);
    }
    if (typeof node !== 'object' || node === null || seen.has(node)) continue;
    seen.add(node);
    if (
      !Array.isArray(node) &&
      typeof (node as Node).$ref === 'string' &&
      !((node as Node).$ref as string).startsWith('#')
    ) {
      throw new OpenApiError(
        `${at}: the $ref "${(node as Node).$ref}" points outside the document. Only local references (#/…) are followed; nothing is fetched.`,
      );
    }
    for (const [key, child] of Object.entries(node)) stack.push([child, `${at}/${key}`]);
  }
}

/** The object a `$ref` chain ends at; the node itself when it is not a reference. */
function resolve(document: unknown, node: unknown, where: string): unknown {
  let current = node;
  for (let hops = 0; isNode(current) && typeof current.$ref === 'string'; hops++) {
    if (hops >= SPEC_LIMITS.refs) {
      throw new OpenApiError(`${where}: references nest more than ${SPEC_LIMITS.refs} deep, or loop on themselves.`);
    }
    try {
      current = pointer(document, current.$ref, where);
    } catch (error) {
      if (error instanceof JsonSchemaError) throw new OpenApiError(error.message);
      throw error;
    }
  }
  return current;
}

const JSON_TYPE = /^application\/(?:[\w.-]+\+)?json(?:\s*;.*)?$/i;

function jsonEntry(content: unknown): [string, Node] | undefined {
  if (!isNode(content)) return undefined;
  const entries = Object.entries(content).filter(([type, media]) => JSON_TYPE.test(type) && isNode(media));
  const exact = entries.find(([type]) => type.toLowerCase().startsWith('application/json'));
  return (exact ?? entries[0]) as [string, Node] | undefined;
}

/** A Swagger 2 parameter carries its schema's keywords itself; the keywords of a schema are the rest. */
function swaggerSchema(param: Node): unknown {
  const {
    name: _name,
    in: _in,
    required: _required,
    description: _description,
    collectionFormat: _c,
    ...schema
  } = param;
  return Object.keys(schema).length > 0 ? schema : undefined;
}

function readParams(document: Node, lists: unknown[], swagger: boolean, where: string): ParamSpec[] {
  const params = new Map<string, ParamSpec>();
  for (const list of lists) {
    if (list === undefined) continue;
    if (!Array.isArray(list)) throw new OpenApiError(`${where}: parameters must be a list.`);
    for (const raw of list) {
      const param = resolve(document, raw, where);
      if (!isNode(param) || typeof param.name !== 'string' || typeof param.in !== 'string') continue;
      if (!['path', 'query', 'header', 'cookie'].includes(param.in)) continue;
      const media = !swagger && isNode(param.content) ? Object.values(param.content).find(isNode) : undefined;
      const schema = swagger ? swaggerSchema(param) : (param.schema ?? (isNode(media) ? media.schema : undefined));
      const location = param.in as ParamLocation;
      params.set(`${location}:${location === 'header' ? param.name.toLowerCase() : param.name}`, {
        name: param.name,
        in: location,
        required: location === 'path' || param.required === true,
        schema,
        explode: swagger ? param.collectionFormat === 'multi' : param.explode !== false,
      });
    }
  }
  return [...params.values()];
}

function readBody(document: Node, op: Node, swagger: boolean, params: unknown[], where: string): BodySpec | undefined {
  if (swagger) {
    const raw = params
      .flatMap((list) => (Array.isArray(list) ? list : []))
      .map((param) => resolve(document, param, where))
      .find((param): param is Node => isNode(param) && param.in === 'body');
    if (!raw) return undefined;
    return { required: raw.required === true, schema: raw.schema, json: true, contentTypes: ['application/json'] };
  }
  const body = resolve(document, op.requestBody, where);
  if (!isNode(body)) return undefined;
  const found = jsonEntry(body.content);
  return {
    required: body.required === true,
    schema: found?.[1].schema,
    json: found !== undefined,
    contentTypes: isNode(body.content) ? Object.keys(body.content) : [],
  };
}

function readResponses(document: Node, op: Node, swagger: boolean, where: string): ResponseSpec[] {
  const out: ResponseSpec[] = [];
  const responses = resolve(document, op.responses, where);
  if (!isNode(responses)) return out;
  for (const [key, raw] of Object.entries(responses)) {
    if (key.startsWith('x-')) continue;
    const response = resolve(document, raw, `${where} response ${key}`);
    if (!isNode(response)) continue;
    const fixed = /^[1-5]\d\d$/.test(key) ? Number(key) : undefined;
    const range = /^[1-5]XX$/i.test(key) ? Number(key[0]) * 100 : undefined;
    if (fixed === undefined && range === undefined && key !== 'default') continue;
    const found = swagger
      ? response.schema === undefined
        ? undefined
        : (['application/json', { schema: response.schema }] as [string, Node])
      : jsonEntry(response.content);
    const headers: Record<string, unknown> = {};
    if (isNode(response.headers)) {
      for (const [name, header] of Object.entries(response.headers)) {
        const resolved = resolve(document, header, `${where} response ${key}`);
        if (isNode(resolved)) headers[name] = swagger ? swaggerSchema(resolved) : resolved.schema;
      }
    }
    out.push({
      key,
      status: fixed ?? range ?? 200,
      description: typeof response.description === 'string' ? response.description : '',
      schema: found?.[1].schema,
      json: found !== undefined,
      mediaType: found?.[0] ?? 'application/json',
      contentTypes: swagger
        ? response.schema === undefined
          ? []
          : ['application/json']
        : isNode(response.content)
          ? Object.keys(response.content)
          : [],
      headers,
    });
  }
  return out;
}

/** The path every operation is also served under: a `servers` URL's path, or Swagger 2's `basePath`. */
function basePathOf(document: Node): string {
  let raw: unknown;
  if (typeof document.basePath === 'string') raw = document.basePath;
  else if (
    Array.isArray(document.servers) &&
    isNode(document.servers[0]) &&
    typeof document.servers[0].url === 'string'
  ) {
    const server = document.servers[0] as Node;
    const variables = isNode(server.variables) ? server.variables : {};
    const url = (server.url as string).replace(/\{([^}]+)\}/g, (_, name: string) => {
      const variable = variables[name];
      return isNode(variable) && typeof variable.default === 'string' ? variable.default : 'x';
    });
    raw = /^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? new URL(url).pathname : url.split(/[?#]/, 1)[0];
  }
  if (typeof raw !== 'string') return '';
  const trimmed = `/${raw.replace(/^\/+|\/+$/g, '')}`;
  return trimmed === '/' ? '' : trimmed;
}

export function compilePath(template: string): { pattern: RegExp; names: string[]; literal: number } {
  if (template.length > SPEC_LIMITS.path) {
    throw new OpenApiError(`The path "${template.slice(0, 40)}…" is longer than ${SPEC_LIMITS.path} characters.`);
  }
  const names: string[] = [];
  let literal = 0;
  const segments = template
    .split('/')
    .slice(1)
    .map((segment) => {
      let pattern = '';
      let rest = segment;
      let hadParam = false;
      for (const match of segment.matchAll(/\{([^{}/]+)\}/g)) {
        const at = rest.indexOf(match[0]);
        pattern += escapeLiteral(rest.slice(0, at));
        pattern += '([^/]+)';
        names.push(match[1] as string);
        rest = rest.slice(at + match[0].length);
        hadParam = true;
      }
      pattern += escapeLiteral(rest);
      if (!hadParam) literal += 1;
      return pattern;
    });
  return { pattern: new RegExp(`^/${segments.join('/')}/?$`), names, literal };
}

/** Reads the document, or throws `OpenApiError` naming everything that cannot be mocked. */
export function readSpec(input: unknown): ReadSpec {
  if (!isNode(input)) throw new OpenApiError('The document must be an object: an OpenAPI or Swagger document.');
  const swagger = input.swagger === '2.0';
  const version = typeof input.openapi === 'string' ? input.openapi : undefined;
  if (!swagger && !(version && /^3\.\d+(\.\d+)?/.test(version))) {
    throw new OpenApiError(
      'This is not an OpenAPI 3.x or Swagger 2.0 document: it has no "openapi: 3.…" or "swagger: 2.0".',
    );
  }
  scan(input);
  if (!isNode(input.paths)) throw new OpenApiError('The document has no "paths" to mock.');

  const operations: Operation[] = [];
  const problems: string[] = [];
  for (const [template, rawItem] of Object.entries(input.paths)) {
    if (template.startsWith('x-')) continue;
    if (!template.startsWith('/')) {
      problems.push(`The path "${template}" must start with "/".`);
      continue;
    }
    const item = resolve(input, rawItem, `paths ${template}`);
    if (!isNode(item)) continue;
    for (const method of METHODS) {
      const op = item[method];
      if (!isNode(op)) continue;
      const where = `${method.toUpperCase()} ${template}`;
      if (operations.length >= SPEC_LIMITS.operations) {
        throw new OpenApiError(`The document has more than ${SPEC_LIMITS.operations} operations.`);
      }
      try {
        const lists = [item.parameters, op.parameters];
        const compiled = compilePath(template);
        operations.push({
          method,
          template,
          pattern: compiled.pattern,
          pathNames: compiled.names,
          literal: compiled.literal,
          params: readParams(input, lists, swagger, where),
          body: readBody(input, op, swagger, lists, where),
          responses: readResponses(input, op, swagger, where),
          operationId: typeof op.operationId === 'string' ? op.operationId : undefined,
          summary: typeof op.summary === 'string' ? op.summary : undefined,
        });
      } catch (error) {
        if (!(error instanceof OpenApiError)) throw error;
        problems.push(error.message.startsWith(where) ? error.message : `${where}: ${error.message}`);
      }
    }
  }
  if (problems.length > 0) {
    throw new OpenApiError(
      `${problems.slice(0, 10).join('\n')}${problems.length > 10 ? `\n…and ${problems.length - 10} more.` : ''}`,
    );
  }
  if (operations.length === 0) throw new OpenApiError('The document has no operations (get, post, …) to mock.');
  // The most specific first: `/pets/mine` before `/pets/{id}`.
  operations.sort((a, b) => a.pathNames.length - b.pathNames.length || b.literal - a.literal);
  const info = isNode(input.info) ? input.info : {};
  return {
    document: input,
    title: typeof info.title === 'string' ? info.title : 'API',
    version: typeof info.version === 'string' ? info.version : '',
    operations,
    basePath: basePathOf(input),
  };
}
