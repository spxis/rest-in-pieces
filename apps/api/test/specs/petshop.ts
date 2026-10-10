/** A small OpenAPI 3.0 document for the mock's tests: a list, an envelope, an item, writes, refs and error responses. */
export const petshop = {
  openapi: '3.0.3',
  info: { title: 'Pet shop', version: '1.2.0' },
  servers: [{ url: 'https://api.example.com/v1' }],
  paths: {
    '/pets': {
      get: {
        operationId: 'listPets',
        parameters: [
          { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 50, default: 5 } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['available', 'sold'] } },
          { name: 'tags', in: 'query', schema: { type: 'array', items: { type: 'string' } } },
          { name: 'X-Tenant', in: 'header', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': {
            description: 'ok',
            headers: { 'X-Total-Count': { schema: { type: 'integer', minimum: 1, maximum: 9999 } } },
            content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Pet' } } } },
          },
          '400': { $ref: '#/components/responses/Error' },
        },
      },
      post: {
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/NewPet' } } },
        },
        responses: {
          '201': {
            description: 'created',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } },
          },
          '422': { $ref: '#/components/responses/Error' },
        },
      },
    },
    '/pets/mine': {
      get: {
        responses: {
          '200': { description: 'ok', content: { 'application/json': { schema: { type: 'string', enum: ['mine'] } } } },
        },
      },
    },
    '/pets/{petId}': {
      parameters: [{ name: 'petId', in: 'path', required: true, schema: { type: 'integer', minimum: 1 } }],
      get: {
        responses: {
          '200': {
            description: 'ok',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } },
          },
          '404': { $ref: '#/components/responses/Error' },
          '503': { description: 'down' },
        },
      },
      put: {
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/NewPet' } } } },
        responses: {
          '200': {
            description: 'ok',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } },
          },
          '201': {
            description: 'made',
            content: {
              'application/json': {
                schema: { type: 'object', required: ['made'], properties: { made: { type: 'boolean', enum: [true] } } },
              },
            },
          },
        },
      },
      delete: { responses: { '204': { description: 'gone' } } },
    },
    '/owners': {
      get: {
        responses: {
          '200': {
            description: 'a page',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['data', 'total'],
                  properties: {
                    total: { type: 'integer' },
                    data: { type: 'array', items: { $ref: '#/components/schemas/Owner' } },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/files/{name}.json': {
      get: {
        parameters: [{ name: 'name', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'ok', content: { 'application/json': { schema: { type: 'object' } } } } },
      },
    },
    '/report': {
      get: {
        responses: { '200': { description: 'csv', content: { 'text/csv': { schema: { type: 'string' } } } } },
      },
    },
    '/ping': { get: { responses: { '200': { description: 'ok', content: { 'application/json': {} } } } } },
    '/search': {
      get: {
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { name: 'delay', in: 'query', schema: { type: 'integer' } },
        ],
        responses: {
          '200': {
            description: 'ok',
            content: { 'application/json': { schema: { type: 'object', properties: { hits: { type: 'integer' } } } } },
          },
        },
      },
    },
    '/problem': {
      get: {
        responses: {
          default: {
            description: 'whatever',
            content: {
              'application/problem+json': {
                schema: { type: 'object', required: ['title'], properties: { title: { type: 'string' } } },
              },
            },
          },
        },
      },
    },
    '/ranged': {
      get: {
        responses: {
          '2XX': {
            description: 'ok',
            content: {
              'application/json': {
                schema: { type: 'object', required: ['n'], properties: { n: { type: 'integer' } } },
              },
            },
          },
        },
      },
    },
  },
  components: {
    responses: {
      Error: {
        description: 'error',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
    },
    schemas: {
      Error: {
        type: 'object',
        required: ['code', 'message'],
        properties: { code: { type: 'integer' }, message: { type: 'string' } },
      },
      NewPet: {
        type: 'object',
        required: ['name'],
        properties: { name: { type: 'string', minLength: 2, maxLength: 30 }, tag: { type: 'string' } },
      },
      Pet: {
        allOf: [
          { $ref: '#/components/schemas/NewPet' },
          {
            type: 'object',
            required: ['id'],
            properties: {
              id: { type: 'integer' },
              status: { type: 'string', enum: ['available', 'sold'] },
              born: { type: 'string', format: 'date' },
              owner: { $ref: '#/components/schemas/Owner' },
            },
          },
        ],
      },
      Owner: {
        type: 'object',
        required: ['id', 'email'],
        properties: { id: { type: 'integer' }, email: { type: 'string', format: 'email' }, name: { type: 'string' } },
      },
    },
  },
} as const;

export const TENANT = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
