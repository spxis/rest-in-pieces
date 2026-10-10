import { describe, expect, it, vi } from 'vitest';
import { compilePath, OpenApiError, readSpec, SPEC_LIMITS } from '../src/lib/openapiSpec.ts';
import { petshop } from './specs/petshop.ts';

const ok = { '200': { description: 'ok', content: { 'application/json': { schema: { type: 'string' } } } } };
const oas = (paths: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  openapi: '3.1.0',
  info: { title: 'T', version: '1' },
  paths,
  ...extra,
});
const refuses = (document: unknown) => {
  try {
    readSpec(document);
  } catch (error) {
    expect(error).toBeInstanceOf(OpenApiError);
    return (error as Error).message;
  }
  throw new Error('the document was accepted');
};

describe('readSpec', () => {
  it('reads every operation, with its parameters, body and responses', () => {
    const spec = readSpec(petshop);
    expect(spec.title).toBe('Pet shop');
    expect(spec.version).toBe('1.2.0');
    expect(spec.basePath).toBe('/v1');
    const list = spec.operations.find((op) => op.method === 'get' && op.template === '/pets');
    expect(list?.operationId).toBe('listPets');
    expect(list?.params.map((param) => `${param.in}:${param.name}`)).toEqual([
      'query:limit',
      'query:status',
      'query:tags',
      'header:X-Tenant',
    ]);
    expect(list?.params.find((param) => param.name === 'X-Tenant')?.required).toBe(true);
    expect(list?.responses.map((response) => response.key)).toEqual(['200', '400']);
    const post = spec.operations.find((op) => op.method === 'post');
    expect(post?.body).toMatchObject({ required: true, json: true });
    // A path-level parameter is the operation's own.
    const item = spec.operations.find((op) => op.template === '/pets/{petId}' && op.method === 'get');
    expect(item?.params).toMatchObject([{ name: 'petId', in: 'path', required: true }]);
    expect(item?.pathNames).toEqual(['petId']);
    expect(spec.operations.length).toBe(13);
  });

  it('puts the most specific path first', () => {
    const spec = readSpec(petshop);
    const order = spec.operations.filter((op) => op.method === 'get').map((op) => op.template);
    expect(order.indexOf('/pets/mine')).toBeLessThan(order.indexOf('/pets/{petId}'));
  });

  it('refuses what is not an OpenAPI or Swagger document, naming the fault', () => {
    expect(refuses(null)).toContain('must be an object');
    expect(refuses({ info: {} })).toContain('not an OpenAPI 3.x or Swagger 2.0 document');
    expect(refuses({ openapi: '2.0' })).toContain('not an OpenAPI 3.x');
    expect(refuses({ openapi: '3.0.0' })).toContain('no "paths"');
    expect(refuses(oas({}))).toContain('no operations');
    expect(refuses(oas({ nope: { get: { responses: ok } } }))).toContain('must start with "/"');
    expect(refuses(oas({ [`/${'a'.repeat(SPEC_LIMITS.path)}`]: { get: { responses: ok } } }))).toContain(
      'longer than 500',
    );
  });

  it('follows no reference outside the document, and fetches nothing', () => {
    const fetched = vi.spyOn(globalThis, 'fetch');
    try {
      for (const ref of ['https://example.com/spec.yaml#/A', './schemas.yaml#/A', 'other.json']) {
        const message = refuses(
          oas({
            '/a': {
              get: {
                responses: { '200': { description: 'ok', content: { 'application/json': { schema: { $ref: ref } } } } },
              },
            },
          }),
        );
        expect(message, ref).toContain('points outside the document');
        expect(message).toContain('#/paths//a/get/responses/200/content/application/json/schema');
      }
      // A reference in a path item, a parameter or a requestBody is checked as well.
      expect(refuses(oas({ '/a': { $ref: 'paths.yaml#/a' } }))).toContain('points outside the document');
      expect(refuses(oas({ '/a': { get: { parameters: [{ $ref: 'p.yaml' }], responses: ok } } }))).toContain('p.yaml');
      expect(fetched).not.toHaveBeenCalled();
    } finally {
      fetched.mockRestore();
    }
  });

  it('refuses a reference that points at nothing, or loops', () => {
    expect(
      refuses(oas({ '/a': { get: { responses: { '200': { $ref: '#/components/responses/Gone' } } } } })),
    ).toContain('GET /a');
    const loop = oas(
      { '/a': { get: { responses: { '200': { $ref: '#/components/responses/A' } } } } },
      {
        components: { responses: { A: { $ref: '#/components/responses/B' }, B: { $ref: '#/components/responses/A' } } },
      },
    );
    expect(refuses(loop)).toContain('loop on themselves');
  });

  it('reports up to ten problems at once', () => {
    const paths: Record<string, unknown> = {};
    for (let i = 0; i < 14; i++) paths[`bad${i}`] = { get: { responses: ok } };
    const message = refuses(oas(paths));
    expect(message.split('\n')).toHaveLength(11);
    expect(message).toContain('…and 4 more.');
  });

  it('is bounded: operations, values and path length', () => {
    const paths: Record<string, unknown> = {};
    for (let i = 0; i <= SPEC_LIMITS.operations; i++) paths[`/p${i}`] = { get: { responses: ok } };
    expect(refuses(oas(paths))).toContain('more than 1000 operations');
    const big = oas(
      { '/a': { get: { responses: ok } } },
      { 'x-data': Array.from({ length: SPEC_LIMITS.nodes + 1 }, () => 1) },
    );
    expect(refuses(big)).toContain('more than 500,000 values');
  });

  it('survives a document that refers to itself', () => {
    const cyclic: Record<string, unknown> = oas({ '/a': { get: { responses: ok } } });
    cyclic['x-self'] = cyclic;
    expect(readSpec(cyclic).operations).toHaveLength(1);
  });

  it('reads parameters and responses by reference, and a path item by reference', () => {
    const spec = readSpec(
      oas(
        {
          '/a/{id}': { $ref: '#/x-item' },
          '/b': {
            get: {
              parameters: [{ $ref: '#/components/parameters/Page' }],
              responses: { '200': { $ref: '#/components/responses/Ok' } },
            },
          },
        },
        {
          'x-item': {
            get: {
              parameters: [
                {
                  name: 'id',
                  in: 'path',
                  required: true,
                  content: { 'application/json': { schema: { type: 'integer' } } },
                },
              ],
              responses: ok,
            },
          },
          components: {
            parameters: { Page: { name: 'page', in: 'query', schema: { type: 'integer' } } },
            responses: { Ok: { description: 'fine', content: { 'application/json': { schema: { type: 'object' } } } } },
          },
        },
      ),
    );
    expect(spec.operations.map((op) => op.template).sort()).toEqual(['/a/{id}', '/b']);
    expect(spec.operations.find((op) => op.template === '/b')?.params[0]).toMatchObject({ name: 'page', in: 'query' });
    expect(spec.operations.find((op) => op.template === '/a/{id}')?.params[0]?.schema).toEqual({ type: 'integer' });
    expect(spec.operations.find((op) => op.template === '/b')?.responses[0]?.description).toBe('fine');
  });

  it('serves under a base path from servers (with variables) or basePath, and none otherwise', () => {
    const base = (extra: Record<string, unknown>) =>
      readSpec(oas({ '/a': { get: { responses: ok } } }, extra)).basePath;
    expect(base({})).toBe('');
    expect(base({ servers: [{ url: 'https://x.test/api/v2/' }] })).toBe('/api/v2');
    expect(base({ servers: [{ url: '/root' }] })).toBe('/root');
    expect(base({ servers: [{ url: 'https://x.test' }] })).toBe('');
    expect(base({ servers: [{ url: 'https://{host}/{ver}', variables: { ver: { default: 'v3' } } }] })).toBe('/v3');
  });

  it('reads Swagger 2.0: a body parameter, response schemas, definitions and basePath', () => {
    const spec = readSpec({
      swagger: '2.0',
      info: { title: 'Old', version: '0.1' },
      basePath: '/old',
      paths: {
        '/things': {
          get: {
            parameters: [{ name: 'size', in: 'query', type: 'integer', maximum: 5 }],
            responses: {
              '200': {
                description: 'ok',
                schema: { type: 'array', items: { $ref: '#/definitions/Thing' } },
                headers: { 'X-N': { type: 'integer' } },
              },
            },
          },
          post: {
            parameters: [{ name: 'body', in: 'body', required: true, schema: { $ref: '#/definitions/Thing' } }],
            responses: { '201': { description: 'made', schema: { $ref: '#/definitions/Thing' } } },
          },
        },
      },
      definitions: { Thing: { type: 'object', properties: { id: { type: 'integer' } } } },
    });
    expect(spec.basePath).toBe('/old');
    const get = spec.operations.find((op) => op.method === 'get');
    expect(get?.params[0]).toMatchObject({ name: 'size', schema: { type: 'integer', maximum: 5 } });
    expect(get?.responses[0]).toMatchObject({ json: true, headers: { 'X-N': { type: 'integer' } } });
    expect(spec.operations.find((op) => op.method === 'post')?.body).toMatchObject({ required: true, json: true });
  });

  it('notes a body or response that is not JSON, and takes the JSON media type it finds', () => {
    const spec = readSpec(
      oas({
        '/a': {
          post: {
            requestBody: { content: { 'multipart/form-data': { schema: { type: 'object' } } } },
            responses: {
              '200': {
                description: 'p',
                content: { 'application/problem+json; charset=utf-8': { schema: { type: 'object' } } },
              },
              '202': { description: 'csv', content: { 'text/csv': {} } },
              '204': { description: 'none' },
              default: { description: 'any' },
              'x-extension': {},
              '999': { description: 'ignored' },
            },
          },
        },
      }),
    );
    const op = spec.operations[0];
    expect(op?.body).toMatchObject({ json: false, contentTypes: ['multipart/form-data'] });
    expect(op?.responses.map((response) => response.key)).toEqual(['200', '202', '204', 'default']);
    expect(op?.responses[0]?.mediaType).toContain('problem+json');
    expect(op?.responses[1]).toMatchObject({ json: false, contentTypes: ['text/csv'] });
  });
});

describe('compilePath', () => {
  it('matches literals exactly and parameters as one segment', () => {
    const { pattern, names } = compilePath('/files/{name}.json');
    expect(names).toEqual(['name']);
    expect(pattern.exec('/files/a.json')?.[1]).toBe('a');
    expect(pattern.exec('/files/a.json/')?.[1]).toBe('a');
    expect(pattern.test('/files/a/b.json')).toBe(false);
    expect(pattern.test('/filesXa.json')).toBe(false);
    expect(compilePath('/a.b/(c)').pattern.test('/aXb/(c)')).toBe(false);
    expect(compilePath('/a.b/(c)').pattern.test('/a.b/(c)')).toBe(true);
  });

  it('cannot be made to run away by a hostile path or request', () => {
    const { pattern } = compilePath('/{a}/{b}/{c}/{d}/{e}/{f}');
    const started = performance.now();
    pattern.test(`/${'x'.repeat(100_000)}`);
    pattern.test(`/${'x/'.repeat(50_000)}!`);
    expect(performance.now() - started).toBeLessThan(500);
  });
});
