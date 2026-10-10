import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  brunoCollection,
  collectionFiles,
  collectionPathsOnDisk,
  type Operation,
  postmanCollection,
  readOperations,
} from '../../../scripts/collections.ts';
import { createApp } from '../src/core.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const document = (await (await createApp().request('/openapi.json')).json()) as Record<string, unknown>;
const operations = readOperations(document);

// biome-ignore lint/suspicious/noExplicitAny: a parsed collection is read for whatever each request has
type Item = { name: string; request?: Record<string, any>; item?: Item[] };
const postman = () =>
  JSON.parse(readFileSync(join(root, 'collections/postman/rest-in-pieces.postman_collection.json'), 'utf8')) as {
    info: { name: string; schema: string };
    variable: Array<{ key: string; value: string }>;
    item: Item[];
  };

describe('the committed Postman and Bruno collections', () => {
  it('are what the generator makes from the API now, byte for byte, with no file missing or left over', async () => {
    const made = await collectionFiles();
    expect(collectionPathsOnDisk()).toEqual(Object.keys(made).sort());
    for (const [path, content] of Object.entries(made)) {
      expect(readFileSync(join(root, path), 'utf8'), `${path} is out of date: run pnpm collections`).toBe(content);
    }
  });

  it('make the same files every time', async () => {
    expect(await collectionFiles()).toEqual(await collectionFiles());
  });

  it('hold a request for every operation of the OpenAPI document, once', () => {
    const paths = Object.values(document.paths as Record<string, Record<string, unknown>>).flatMap((item) =>
      ['get', 'put', 'post', 'delete', 'patch'].filter((method) => method in item),
    );
    expect(operations).toHaveLength(paths.length);
    expect(paths.length).toBeGreaterThan(100);
    const requests = postman().item.flatMap((folder) => folder.item ?? []);
    expect(requests).toHaveLength(operations.length);
    const bruno = collectionPathsOnDisk().filter(
      (path) => path.endsWith('.bru') && !/folder\.bru$|environments/.test(path),
    );
    expect(bruno).toHaveLength(operations.length);
    expect(new Set(bruno).size).toBe(bruno.length);
  });
});

describe('the Postman collection', () => {
  it('is a v2.1 collection with a base address a reader can change', () => {
    const collection = postman();
    expect(collection.info.schema).toBe('https://schema.getpostman.com/json/collection/v2.1.0/collection.json');
    expect(collection.info.name).toBe('REST in Pieces');
    expect(collection.variable).toEqual([
      { key: 'baseUrl', value: 'http://localhost:6800' },
      { key: 'token', value: '' },
    ]);
    // No version is written into it, so a release does not make it stale.
    expect(JSON.stringify(collection)).not.toMatch(/"version"/);
  });

  it('puts every request under {{baseUrl}}, with each path variable defined and a body that is JSON', () => {
    for (const folder of postman().item) {
      for (const { request, name } of folder.item ?? []) {
        expect(request?.url.raw, name).toMatch(/^\{\{baseUrl\}\}\//);
        const named = [...String(request?.url.raw).matchAll(/\/:(\w+)/g)].map((match) => match[1]);
        expect(
          (request?.url.variable ?? []).map((variable: { key: string }) => variable.key),
          name,
        ).toEqual(named);
        if (request?.body) {
          expect(request.body.mode).toBe('raw');
          expect(() => JSON.parse(request.body.raw), name).not.toThrow();
          expect(request.header).toEqual([{ key: 'Content-Type', value: 'application/json' }]);
        }
        expect(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).toContain(request?.method);
      }
    }
  });

  it('switches on limit and seed only, and keeps the other parameters, with their text, switched off', () => {
    const list = postman()
      .item.flatMap((folder) => folder.item ?? [])
      .find((item) => item.name === 'List users');
    const query = list?.request?.url.query as Array<{
      key: string;
      value: string;
      description: string;
      disabled: boolean;
    }>;
    expect(list?.request?.url.raw).toBe('{{baseUrl}}/users?limit=10&seed=1');
    expect(query.filter((param) => !param.disabled).map((param) => param.key)).toEqual(['limit', 'seed']);
    expect(query.find((param) => param.key === 'offset')).toMatchObject({
      disabled: true,
      description: 'Records to skip.',
    });
    expect(query.length).toBeGreaterThan(5);
  });

  it('asks for a token only where the API will not answer without one', () => {
    const withAuth = postman()
      .item.flatMap((folder) => folder.item ?? [])
      .filter((item) => item.request?.auth);
    expect(withAuth.map((item) => item.name)).toEqual(['The signed-in user']);
    expect(withAuth[0]?.request?.auth).toEqual({
      type: 'bearer',
      bearer: [{ key: 'token', value: '{{token}}', type: 'string' }],
    });
  });
});

describe('the Bruno collection', () => {
  const read = (path: string) => readFileSync(join(root, 'collections/bruno', path), 'utf8');

  it('is a Bruno collection with a Local environment that holds the base address', () => {
    expect(JSON.parse(read('bruno.json'))).toEqual({
      version: '1',
      name: 'REST in Pieces',
      type: 'collection',
      ignore: ['node_modules', '.git'],
    });
    expect(read('environments/Local.bru')).toBe('vars {\n  baseUrl: http://localhost:6800\n  token: \n}\n');
  });

  it('writes a request as Bruno reads it: meta, the method with its url, query and path parameters, a JSON body', () => {
    const one = read('Datasets/Get one user.bru');
    expect(one).toContain('meta {\n  name: Get one user\n  type: http\n');
    expect(one).toContain('get {\n  url: {{baseUrl}}/users/:id\n  body: none\n  auth: none\n}');
    expect(one).toContain('params:path {\n  id: 1\n}');
    expect(one).toMatch(/params:query \{\n {2}seed: 1\n {2}~locale: \n/);
    const create = read('Datasets/Create a user.bru');
    expect(create).toContain('post {\n  url: {{baseUrl}}/users\n  body: json\n');
    const body = create.match(/body:json \{\n([\s\S]*?)\n\}\n/)?.[1] ?? '';
    expect(JSON.parse(body)).toMatchObject({ firstName: expect.any(String), email: expect.stringContaining('@') });
    expect(read('Auth/The signed-in user.bru')).toContain('auth:bearer {\n  token: {{token}}\n}');
  });

  it('keeps a folder for each tag and a unique, safe file name for each request', () => {
    const paths = collectionPathsOnDisk().filter((path) => path.startsWith('collections/bruno/'));
    expect(paths.filter((path) => path.endsWith('/folder.bru')).length).toBe(
      new Set(operations.map((op) => op.tag)).size,
    );
    expect(paths.some((path) => /[\\:*?"<>|]/.test(path.slice('collections/bruno/'.length)))).toBe(false);
    const lower = paths.map((path) => path.toLowerCase());
    expect(new Set(lower).size).toBe(lower.length);
  });
});

describe('the generator', () => {
  const op = (overrides: Partial<Operation>): Operation => ({
    tag: 'T',
    method: 'GET',
    path: '/a',
    name: 'Same',
    description: '',
    params: [],
    body: undefined,
    secured: false,
    ...overrides,
  });

  it('tells two requests with one name apart, and cleans a name that is not a file name', () => {
    const files = brunoCollection([op({}), op({ path: '/b' }), op({ name: 'A/B: "what"?', path: '/c' })]);
    expect(Object.keys(files).filter((path) => path.endsWith('.bru') && path.startsWith('T/'))).toEqual([
      'T/folder.bru',
      'T/Same.bru',
      'T/Same GET b.bru',
      'T/A B what.bru',
    ]);
  });

  it('writes a parameter that is part of a segment as its example, since an app cannot fill it in', () => {
    const [read] = readOperations({
      openapi: '3.1.0',
      paths: {
        '/images/{w}x{h}.svg': {
          get: {
            parameters: [
              { name: 'w', in: 'path', required: true, schema: { type: 'string', example: '640' } },
              { name: 'h', in: 'path', required: true, schema: { type: 'string', example: '360' } },
            ],
            responses: {},
          },
        },
      },
    });
    const item = (postmanCollection([read as Operation]).item as Item[])[0]?.item?.[0];
    expect(item?.request?.url.raw).toBe('{{baseUrl}}/images/640x360.svg');
    expect(item?.request?.url.variable).toBeUndefined();
    expect(brunoCollection([read as Operation])['Other/DELETE.bru']).toBeUndefined();
    expect(Object.values(brunoCollection([read as Operation])).join('\n')).toContain(
      'url: {{baseUrl}}/images/640x360.svg',
    );
  });

  it('names an operation that has no summary by its method and path, and puts an unsorted tag under Other', () => {
    const [read] = readOperations({
      openapi: '3.1.0',
      paths: {
        '/x/{id}': {
          delete: {
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer', example: 7 } }],
            responses: {},
          },
        },
      },
    });
    expect(read).toMatchObject({ tag: 'Other', name: 'DELETE /x/{id}', method: 'DELETE' });
    expect(read?.params[0]).toMatchObject({ name: 'id', value: '7', required: true });
    const item = (postmanCollection([read as Operation]).item as Item[])[0]?.item?.[0];
    expect(item?.request?.url.raw).toBe('{{baseUrl}}/x/:id');
    expect(item?.request?.url.variable).toEqual([{ key: 'id', value: '7', description: '' }]);
  });
});
