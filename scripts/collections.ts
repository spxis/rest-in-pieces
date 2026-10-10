/**
 * Writes a Postman collection and a Bruno collection for the whole API from its OpenAPI document, so a request for every
 * route is one import away: `collections/postman/rest-in-pieces.postman_collection.json` (Postman v2.1) and the
 * `collections/bruno/` folder (Bruno's own file format). Run `pnpm collections` after the API's routes or parameters
 * change; `apps/api/test/collections-files.test.ts` fails when the committed files are not what this makes.
 *
 * Nothing here is random and nothing reads the clock or the package version, so the same API gives the same files.
 * A request body is a seeded example made from its schema by the project's own generator. A query parameter is on when it
 * is `limit` or `seed` and off, with an example, otherwise: switch it on in the app.
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../apps/api/src/core.ts';
import { sampleValue } from '../apps/api/src/lib/openapiMock.ts';

export const BASE_URL = 'http://localhost:6800';
export const COLLECTION_NAME = 'REST in Pieces';
const METHODS = ['get', 'put', 'post', 'delete', 'patch'] as const;
const ON = new Set(['limit', 'seed']);

type Node = Record<string, unknown>;

interface Param {
  name: string;
  in: string;
  required: boolean;
  description: string;
  value: string;
}

export interface Operation {
  tag: string;
  method: string;
  path: string;
  name: string;
  description: string;
  params: Param[];
  body: string | undefined;
  secured: boolean;
}

const text = (value: unknown) => (typeof value === 'string' ? value : '');

/** Every operation of the document, in document order, with its parameters and an example body. */
export function readOperations(document: Node): Operation[] {
  const operations: Operation[] = [];
  for (const [path, item] of Object.entries(document.paths as Record<string, Node>)) {
    for (const method of METHODS) {
      const op = item[method] as Node | undefined;
      if (!op) continue;
      const params = ((op.parameters ?? []) as Node[]).map((param): Param => {
        const schema = (param.schema ?? {}) as Node;
        const example = schema.example ?? param.example ?? schema.default ?? '';
        return {
          name: text(param.name),
          in: text(param.in),
          required: param.required === true,
          description: text(param.description).replace(/\s+/g, ' ').trim(),
          value: String(example),
        };
      });
      const content = ((op.requestBody as Node | undefined)?.content ?? {}) as Record<string, Node>;
      const schema = content['application/json']?.schema;
      operations.push({
        tag: text((op.tags as string[] | undefined)?.[0]) || 'Other',
        method: method.toUpperCase(),
        path,
        name: text(op.summary) || `${method.toUpperCase()} ${path}`,
        description: text(op.description),
        params,
        body: schema === undefined ? undefined : JSON.stringify(sampleValue(document, schema, 1), null, 2),
        // Only a route that cannot be called without a token: an optional one lists an empty requirement beside the scheme.
        secured:
          Array.isArray(op.security) &&
          op.security.length > 0 &&
          op.security.every((entry) => Object.keys(entry as Node).length > 0),
      });
    }
  }
  return operations;
}

/** The path parameters that are a whole segment, which both apps can fill in as a variable: `/users/{id}`. */
const pathVariables = (path: string) =>
  path
    .split('/')
    .map((segment) => segment.match(/^\{([^}]+)\}$/)?.[1])
    .filter((name): name is string => name !== undefined);

/**
 * The path as the apps write it: `:id` for a whole-segment parameter, which they offer as a variable, and the example
 * value put in where a parameter is only part of a segment (`/images/{width}x{height}.svg` becomes `/images/640x360.svg`),
 * which they cannot fill in.
 */
function colonPath(path: string, params: readonly Param[] = []): string {
  const value = (name: string) => params.find((param) => param.in === 'path' && param.name === name)?.value || '1';
  return path
    .split('/')
    .map((segment) =>
      /^\{[^}]+\}$/.test(segment)
        ? `:${segment.slice(1, -1)}`
        : segment.replace(/\{([^}]+)\}/g, (_, name: string) => value(name)),
    )
    .join('/');
}
const isOn = (param: Param) => param.in === 'query' && ON.has(param.name);

function groups(operations: readonly Operation[]): Array<[string, Operation[]]> {
  const byTag = new Map<string, Operation[]>();
  for (const operation of operations) byTag.set(operation.tag, [...(byTag.get(operation.tag) ?? []), operation]);
  return [...byTag];
}

/** The Postman v2.1 collection. */
export function postmanCollection(operations: readonly Operation[]): Node {
  const item = groups(operations).map(([tag, members]) => ({
    name: tag,
    item: members.map((operation) => {
      const query = operation.params.filter((param) => param.in === 'query');
      const on = query.filter(isOn);
      const raw = `{{baseUrl}}${colonPath(operation.path, operation.params)}${on.length ? `?${on.map((p) => `${p.name}=${p.value}`).join('&')}` : ''}`;
      const variables = pathVariables(operation.path).map((name) => {
        const param = operation.params.find((candidate) => candidate.in === 'path' && candidate.name === name);
        return { key: name, value: param?.value || '1', description: param?.description ?? '' };
      });
      return {
        name: operation.name,
        request: {
          method: operation.method,
          header: operation.body === undefined ? [] : [{ key: 'Content-Type', value: 'application/json' }],
          url: {
            raw,
            host: ['{{baseUrl}}'],
            path: colonPath(operation.path, operation.params).split('/').slice(1),
            query: query.map((param) => ({
              key: param.name,
              value: param.value,
              description: param.description,
              disabled: !isOn(param),
            })),
            ...(variables.length ? { variable: variables } : {}),
          },
          ...(operation.body === undefined
            ? {}
            : { body: { mode: 'raw', raw: operation.body, options: { raw: { language: 'json' } } } }),
          ...(operation.secured
            ? { auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{token}}', type: 'string' }] } }
            : {}),
          description: operation.description,
        },
      };
    }),
  }));
  return {
    info: {
      name: COLLECTION_NAME,
      description:
        'A request for every route of REST in Pieces, made from its OpenAPI document. Start the API with `npx @johnmorrisdotca/rest-in-pieces` (it listens on http://localhost:6800), or change the baseUrl variable. `limit` and `seed` are on in each request; switch on any other parameter you need. Sign in with POST /auth/login and put the access token in the token variable for the routes that need one.',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    variable: [
      { key: 'baseUrl', value: BASE_URL },
      { key: 'token', value: '' },
    ],
    item,
  };
}

/** A name safe as a file name on every system, and still readable. */
const fileName = (name: string) =>
  name
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** The Bruno collection: file path (relative to `collections/bruno/`) to the file's text. */
export function brunoCollection(operations: readonly Operation[]): Record<string, string> {
  const files: Record<string, string> = {
    'bruno.json': `${JSON.stringify({ version: '1', name: COLLECTION_NAME, type: 'collection', ignore: ['node_modules', '.git'] }, null, 2)}\n`,
    'environments/Local.bru': `vars {\n  baseUrl: ${BASE_URL}\n  token: \n}\n`,
  };
  for (const [tag, members] of groups(operations)) {
    files[`${fileName(tag)}/folder.bru`] = `meta {\n  name: ${tag}\n}\n`;
    const used = new Set<string>();
    for (const [index, operation] of members.entries()) {
      let name = fileName(operation.name);
      if (used.has(name.toLowerCase())) name = fileName(`${operation.name} ${operation.method} ${operation.path}`);
      used.add(name.toLowerCase());
      const query = operation.params.filter((param) => param.in === 'query');
      const lines = [
        `meta {\n  name: ${operation.name}\n  type: http\n  seq: ${index + 1}\n}\n`,
        `${operation.method.toLowerCase()} {\n  url: {{baseUrl}}${colonPath(operation.path, operation.params)}\n  body: ${operation.body === undefined ? 'none' : 'json'}\n  auth: ${operation.secured ? 'bearer' : 'none'}\n}\n`,
      ];
      if (query.length) {
        lines.push(
          `params:query {\n${query.map((p) => `  ${isOn(p) ? '' : '~'}${p.name}: ${p.value}`).join('\n')}\n}\n`,
        );
      }
      const names = pathVariables(operation.path);
      if (names.length) {
        const value = (name: string) => operation.params.find((p) => p.in === 'path' && p.name === name)?.value || '1';
        lines.push(`params:path {\n${names.map((name) => `  ${name}: ${value(name)}`).join('\n')}\n}\n`);
      }
      if (operation.secured) lines.push('auth:bearer {\n  token: {{token}}\n}\n');
      if (operation.body !== undefined) {
        lines.push(
          `body:json {\n${operation.body
            .split('\n')
            .map((line) => `  ${line}`)
            .join('\n')}\n}\n`,
        );
      }
      if (operation.description) {
        lines.push(
          `docs {\n${operation.description
            .split('\n')
            .map((line) => (line ? `  ${line}` : ''))
            .join('\n')}\n}\n`,
        );
      }
      files[`${fileName(tag)}/${name}.bru`] = lines.join('\n');
    }
  }
  return files;
}

/** Every file the collections are: path from the repository root to text. */
export async function collectionFiles(): Promise<Record<string, string>> {
  const document = (await (await createApp().request('/openapi.json')).json()) as Node;
  const operations = readOperations(document);
  const files: Record<string, string> = {
    'collections/postman/rest-in-pieces.postman_collection.json': `${JSON.stringify(postmanCollection(operations), null, 2)}\n`,
  };
  for (const [path, content] of Object.entries(brunoCollection(operations)))
    files[`collections/bruno/${path}`] = content;
  return files;
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Replaces `collections/` with the files from the API. */
export async function writeCollections(): Promise<number> {
  const files = await collectionFiles();
  rmSync(join(root, 'collections'), { recursive: true, force: true });
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return Object.keys(files).length;
}

/** The paths under `collections/` on disk, relative to the repository root, sorted. */
export function collectionPathsOnDisk(): string[] {
  const walk = (dir: string): string[] =>
    readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? walk(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`],
    );
  return walk('collections').sort();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(`Wrote ${await writeCollections()} files under collections/`);
}
