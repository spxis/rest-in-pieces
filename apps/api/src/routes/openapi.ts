import { swaggerUI } from '@hono/swagger-ui';
import { Hono } from 'hono';

const queryParameter = (name: string, description: string, schema: Record<string, unknown> = { type: 'string' }) => ({
  name,
  in: 'query',
  description,
  required: false,
  schema,
});

const response200 = {
  description: 'Successful response',
  content: { 'application/json': { schema: {} } },
};

const controlParameters = [
  queryParameter('seed', 'Seed for repeatable generated data.', { type: 'integer', minimum: 0 }),
  queryParameter('format', 'Output format: csv, yaml, or xml.', { type: 'string', enum: ['csv', 'yaml', 'xml'] }),
  queryParameter('delay', 'Artificial response delay in milliseconds.', {
    type: 'integer',
    minimum: 0,
    maximum: 10000,
  }),
  queryParameter('status', 'Override the HTTP response status.', { type: 'integer', minimum: 200, maximum: 599 }),
  queryParameter('fail', 'Return a simulated error response.', { type: 'boolean' }),
];

const pageParameters = [
  queryParameter('limit', 'Number of records to return.', { type: 'integer', minimum: 0, maximum: 1000 }),
  queryParameter('offset', 'Number of records to skip.', { type: 'integer', minimum: 0 }),
  queryParameter('sortBy', 'Field to sort by. Append :numeric for numeric comparison.'),
  queryParameter('sortDirection', 'Sort direction: asc or desc.'),
];

export const openApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'REST in Pieces API',
    version: '2.0.0',
    description: 'Repeatable fake data for building and testing client applications.',
  },
  paths: {
    '/names': {
      get: {
        summary: 'Get generated people',
        parameters: [
          ...controlParameters,
          ...pageParameters,
          queryParameter('max', 'Maximum size of the generated dataset.', {
            type: 'integer',
            minimum: 0,
            maximum: 1000,
          }),
          queryParameter('metadata', 'Include response metadata.'),
          queryParameter('resultsName', 'Name of the results property.'),
        ],
        responses: { '200': response200 },
      },
    },
    '/random-names': {
      get: {
        summary: 'Legacy alias for /names',
        parameters: [...controlParameters, ...pageParameters],
        responses: { '200': response200 },
      },
    },
    '/countries': {
      get: {
        summary: 'Get countries',
        parameters: [...controlParameters, ...pageParameters],
        responses: { '200': response200 },
      },
    },
    '/generate': {
      get: {
        summary: 'Generate custom records',
        parameters: [
          ...controlParameters,
          ...pageParameters,
          queryParameter('fields', 'Comma-separated name:generatorType pairs.', {
            type: 'string',
            example: 'name:person.fullName,email:internet.email',
          }),
          queryParameter('max', 'Number of records in the generated dataset.', {
            type: 'integer',
            minimum: 0,
            maximum: 1000,
          }),
        ],
        responses: { '200': response200, '400': { description: 'Invalid field list or generator type.' } },
      },
    },
    '/generators': { get: { summary: 'List supported generator types', responses: { '200': response200 } } },
    '/health': { get: { summary: 'Check service health', responses: { '200': response200 } } },
  },
};

export const openapi = new Hono()
  .get('/openapi.json', (c) => c.json(openApiDocument))
  .get('/docs', swaggerUI({ url: '/openapi.json' }));
