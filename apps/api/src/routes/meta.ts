import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import pkg from '../../package.json' with { type: 'json' };
import { generatorModules, generatorTypes } from '../data/generators.ts';
import { resources } from '../resources.ts';

const started = Date.now();

const generatorsRoute = createRoute({
  method: 'get',
  path: '/generators',
  tags: ['Custom data'],
  operationId: 'listGenerators',
  summary: 'List generator types',
  description: 'Every type `/generate` accepts, as a flat list and grouped by module.',
  responses: {
    200: {
      description: 'Generator types.',
      content: {
        'application/json': {
          schema: z
            .object({
              generators: z.array(z.string()).openapi({ example: ['internet.email', 'person.fullName'] }),
              modules: z.record(z.string(), z.array(z.string())),
            })
            .openapi('Generators'),
        },
      },
    },
  },
});

const resourcesRoute = createRoute({
  method: 'get',
  path: '/resources',
  tags: ['Service'],
  operationId: 'listResources',
  summary: 'List datasets',
  description: 'The built-in collections, with the fields each record has. Useful for building clients and pickers.',
  responses: {
    200: {
      description: 'Datasets.',
      content: {
        'application/json': {
          schema: z
            .array(
              z.object({
                name: z.string(),
                path: z.string(),
                description: z.string(),
                idField: z.string(),
                seeded: z.boolean(),
                fields: z.array(z.string()),
              }),
            )
            .openapi('Resources'),
        },
      },
    },
  },
});

const healthRoute = createRoute({
  method: 'get',
  path: '/health',
  tags: ['Service'],
  operationId: 'health',
  summary: 'Check service health',
  responses: {
    200: {
      description: 'The service is up.',
      content: {
        'application/json': {
          schema: z.object({ status: z.literal('ok'), version: z.string(), uptime: z.number() }).openapi('Health'),
        },
      },
    },
  },
});

const catalog = resources.map((resource) => ({
  name: resource.name,
  path: `/${resource.name}`,
  description: resource.description,
  idField: resource.idField,
  seeded: resource.seeded,
  fields: Object.keys(resource.load(1).records[0] ?? {}),
}));

export const meta = new OpenAPIHono()
  .openapi(generatorsRoute, (c) => c.json({ generators: generatorTypes, modules: generatorModules }))
  .openapi(resourcesRoute, (c) => c.json(catalog))
  .openapi(healthRoute, (c) =>
    c.json({ status: 'ok' as const, version: pkg.version, uptime: Math.round((Date.now() - started) / 1000) }),
  );
