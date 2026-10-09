import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import pkg from '../../package.json' with { type: 'json' };
import { generatorModules, generatorTypes } from '../data/generators.ts';
import { DEFAULT_LOCALE, GLOBAL, GLOBAL_NAME, LOCALE_CODES, LOCALES } from '../lib/locale.ts';
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
                writable: z.boolean().openapi({
                  description: 'Whether the dataset takes `POST`, `PUT`, `PATCH` and `DELETE`. Writes store nothing.',
                }),
                fields: z.array(z.string()),
                locales: z.record(z.string(), z.object({ fields: z.array(z.string()) })).openapi({
                  description:
                    'Fields per `locale`. Japanese records add readings such as `nameKana`; `global` lists every field its locales use.',
                }),
              }),
            )
            .openapi('Resources'),
        },
      },
    },
  },
});

const LocaleInfo = z
  .object({
    code: z.string().openapi({ description: 'The value `locale=` takes.', example: 'en-CA' }),
    name: z.string().openapi({ example: 'English (Canada)' }),
    nativeName: z.string().openapi({ description: 'The name in its own language.', example: 'English (Canada)' }),
    tag: z.string().nullable().openapi({ description: 'BCP 47 language tag; `null` for the mix.', example: 'en-CA' }),
    country: z
      .string()
      .nullable()
      .openapi({ description: 'ISO 3166-1 alpha-2 code records carry as `country`; `null` for the mix.' }),
    currency: z
      .string()
      .nullable()
      .openapi({ description: 'ISO 4217 code products are priced in; `null` for the mix.' }),
    default: z.boolean(),
  })
  .openapi('Locale');

const localesRoute = createRoute({
  method: 'get',
  path: '/locales',
  tags: ['Service'],
  operationId: 'listLocales',
  summary: 'List data locales',
  description: 'Every value the `locale` parameter takes, with its names, country and currency. Useful for pickers.',
  responses: {
    200: {
      description: 'Data locales, the default first.',
      content: { 'application/json': { schema: z.array(LocaleInfo).openapi('Locales') } },
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
  writable: resource.input !== undefined,
  fields: resource.fields(DEFAULT_LOCALE),
  locales: Object.fromEntries(LOCALE_CODES.map((locale) => [locale, { fields: resource.fields(locale) }])),
}));

const locales: z.infer<typeof LocaleInfo>[] = [
  ...LOCALES.map(({ code, name, nativeName, tag, country, currency }) => ({
    code,
    name,
    nativeName,
    tag,
    country,
    currency,
    default: code === DEFAULT_LOCALE,
  })),
  {
    code: GLOBAL,
    name: GLOBAL_NAME,
    nativeName: GLOBAL_NAME,
    tag: null,
    country: null,
    currency: null,
    default: false,
  },
];

export const meta = new OpenAPIHono()
  .openapi(generatorsRoute, (c) => c.json({ generators: generatorTypes, modules: generatorModules }))
  .openapi(resourcesRoute, (c) => c.json(catalog))
  .openapi(localesRoute, (c) => c.json(locales))
  .openapi(healthRoute, (c) =>
    c.json({ status: 'ok' as const, version: pkg.version, uptime: Math.round((Date.now() - started) / 1000) }),
  );
