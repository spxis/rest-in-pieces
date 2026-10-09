import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import {
  type FieldSpec,
  generateRecords,
  MAX_FIELDS,
  parseFieldList,
  SchemaError,
  validateFields,
} from '../data/generators.ts';
import { buildBody, MAX_RECORDS, pageLinks, queryCollection, setPaginationHeaders } from '../lib/collection.ts';
import { requestedFormat, respond } from '../lib/format.ts';
import { contentLanguage, parseLocale } from '../lib/locale.ts';
import { intParam, pick } from '../lib/query.ts';
import { DEFAULT_SEED, MAX_SEED } from '../resources.ts';
import { ErrorBody, FILTER_DOCS, GeneratedRecord, ListQuery, listOf, TEXT_FORMATS } from '../schemas.ts';

const DEFAULTS = { limit: 10, metadata: true };

const listResponses = {
  200: {
    description: 'A page of generated records. Each record has an `index` plus the requested fields.',
    content: { 'application/json': { schema: listOf(GeneratedRecord, 'Generated') }, ...TEXT_FORMATS },
  },
  400: {
    description: 'Invalid field list or generator type, or a cursor that is invalid or belongs to another query.',
    content: { 'application/json': { schema: ErrorBody } },
  },
};

const getRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['Custom data'],
  operationId: 'generate',
  summary: 'Generate records from a field list',
  description: `Describe each field as \`name:generatorType\`, comma-separated. Every paging, sorting, filtering, format and simulation parameter works here too.\n\n${FILTER_DOCS}`,
  request: {
    query: ListQuery.extend({
      fields: z
        .string()
        .optional()
        .openapi({ example: 'name:person.fullName,email:internet.email,price:commerce.price' }),
      count: z.string().optional().openapi({ description: 'Dataset size, 1 to 1000. Defaults to `max`, or 1000.' }),
    }),
  },
  responses: listResponses,
});

const FieldsBody = z
  .union([
    z.record(z.string(), z.string()).openapi({ example: { name: 'person.fullName', email: 'internet.email' } }),
    z.array(z.object({ name: z.string(), type: z.string() })).max(MAX_FIELDS),
  ])
  .openapi({
    description: 'Either `{ "field": "generatorType" }` or `[{ "name": "field", "type": "generatorType" }]`.',
  });

const GenerateRequest = z
  .object({
    fields: FieldsBody,
    count: z.number().int().min(1).max(MAX_RECORDS).optional().openapi({ example: 100 }),
    seed: z.number().int().min(0).max(MAX_SEED).optional().openapi({ example: 42 }),
  })
  .openapi('GenerateRequest');

const postRoute = createRoute({
  method: 'post',
  path: '/',
  tags: ['Custom data'],
  operationId: 'generatePost',
  summary: 'Generate records from a JSON schema',
  description:
    'Send the schema as JSON. Paging, sorting, filtering, format and simulation parameters stay in the query string.',
  request: {
    query: ListQuery,
    body: { required: true, content: { 'application/json': { schema: GenerateRequest } } },
  },
  responses: listResponses,
});

function toFieldSpecs(fields: z.infer<typeof FieldsBody>): FieldSpec[] {
  return Array.isArray(fields) ? fields : Object.entries(fields).map(([name, type]) => ({ name, type }));
}

export const generate = new OpenAPIHono({
  defaultHook: (result, c) => {
    if (!result.success) {
      const issue = result.error.issues[0];
      const where = issue?.path.length ? ` at "${issue.path.join('.')}"` : '';
      return c.json({ error: `Invalid request${where}: ${issue?.message ?? 'unknown problem'}` }, 400);
    }
  },
});

function send(c: Context, fields: FieldSpec[], count: number, seed: number) {
  requestedFormat(c);
  const query = c.req.query();
  const locale = parseLocale(pick(query, 'locale'));
  contentLanguage(c, locale);
  const page = queryCollection(generateRecords(fields, count, seed, locale), query, DEFAULTS, locale, {
    seed,
    keep: ['index'],
  });
  const links = pageLinks(c, page);
  setPaginationHeaders(c, links, page.total);
  return respond(c, buildBody(page, links, { generatedAt: new Date(), seed, locale }), page.records);
}

generate
  .openapi(getRoute, (c) => {
    const query = c.req.query();
    const list = pick(query, 'fields');
    if (!list) throw new SchemaError('Add a fields parameter, e.g. fields=name:person.fullName,email:internet.email');
    const count = intParam(pick(query, 'count', 'max', 'maxRecords'), MAX_RECORDS, MAX_RECORDS);
    const seed = intParam(pick(query, 'seed'), DEFAULT_SEED, MAX_SEED);
    return send(c, parseFieldList(list), Math.max(count, 1), seed) as never;
  })
  .openapi(postRoute, (c) => {
    const body = c.req.valid('json');
    const fields = validateFields(toFieldSpecs(body.fields));
    return send(c, fields, body.count ?? MAX_RECORDS, body.seed ?? DEFAULT_SEED) as never;
  });
